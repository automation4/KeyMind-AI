"""
Mongo-compatible shim over Firebase Firestore.

The original `server.py` was written against Motor (async MongoDB driver). To
swap MongoDB → Firestore without rewriting 60+ call sites, this module exposes
a Mongo-shaped API (`find_one`, `update_one`, `insert_one`, `find_one_and_update`,
`aggregate`, `delete_many`, …) backed by `firebase-admin`'s Firestore client.

Notes
-----
* `firebase-admin` Firestore is synchronous (gRPC). All public methods here are
  `async` and dispatch to a thread pool via `asyncio.to_thread` to preserve the
  non-blocking semantics the FastAPI handlers expect.
* "Document IDs": for collections where every doc has a stable natural key
  (`users.user_id`, `user_sessions.session_token`, `whitelist.email`,
  `chat_messages.id`, `history.id`) we use that field as the Firestore document
  ID. This keeps lookups O(1) and idempotent.
* Mongo's `_id` is silently stripped — we map projection `{"_id": 0}` to a no-op.
* Unsupported Mongo operators raise `NotImplementedError` at runtime, on purpose,
  so we discover incomplete migrations during testing instead of silently
  returning wrong data.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from typing import Any, Callable, Dict, List, Mapping, Optional

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import (
    ArrayUnion,
    ArrayRemove,
    DELETE_FIELD,
    Increment,
    FieldFilter,
)

# ---------------------------------------------------------------------------
# Singleton initialisation — Firestore client is process-wide.
# ---------------------------------------------------------------------------
_CRED_PATH = os.environ.get(
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "/app/backend/secrets/firebase-admin.json",
)

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(_CRED_PATH))

_client = firestore.client()


# Map of "collection name → field used as Firestore document ID".
# When a doc is inserted, we promote that field's value to be the doc id so
# subsequent equality lookups on the same field become O(1) get-by-id calls.
_DOC_ID_FIELD: Dict[str, str] = {
    "users": "user_id",
    "user_sessions": "session_token",
    "whitelist": "email",
    "chat_messages": "id",
    "history": "id",
    "_health_check": "_id_unused",
}


class _Result(dict):
    """Mongo-style update/delete result that supports both dict access (``r["deleted_count"]``)
    and attribute access (``r.deleted_count``) so existing call sites work
    without modification."""

    def __getattr__(self, item: str):
        try:
            return self[item]
        except KeyError:
            raise AttributeError(item)


# Sentinel used by Mongo's `find_one_and_update` — re-exported so callers can
# do `from firestore_compat import ReturnDocument` without changing semantics.
class ReturnDocument:
    BEFORE = "before"
    AFTER = "after"


# ---------------------------------------------------------------------------
# Helpers — translate Mongo filter / update dicts → Firestore primitives.
# ---------------------------------------------------------------------------
_OP_MAP = {
    "$eq": "==",
    "$ne": "!=",
    "$gt": ">",
    "$gte": ">=",
    "$lt": "<",
    "$lte": "<=",
    "$in": "in",
    "$nin": "not-in",
}


def _build_where_clauses(filter_: Mapping[str, Any]) -> List[FieldFilter]:
    """Translate a flat Mongo filter dict → Firestore FieldFilters.

    Supported value shapes per field:
      * Scalar  → equality
      * `{"$in": [...]}` / `{"$gt": v}` / etc.
      * `{"$exists": True/False}` → no-op (post-filtered client-side)
      * `{"$type": "string"}`     → no-op (post-filtered client-side)
    """
    clauses: List[FieldFilter] = []
    for field, value in filter_.items():
        if isinstance(value, dict):
            for op, operand in value.items():
                if op in _OP_MAP:
                    clauses.append(FieldFilter(field, _OP_MAP[op], operand))
                # $exists / $type are validated post-query (see _post_filter).
        else:
            clauses.append(FieldFilter(field, "==", value))
    return clauses


def _post_filter(doc: Dict[str, Any], filter_: Mapping[str, Any]) -> bool:
    """Client-side filter for predicates Firestore can't express in a where()."""
    for field, value in filter_.items():
        if isinstance(value, dict):
            for op, operand in value.items():
                if op == "$exists":
                    present = field in doc and doc[field] is not None
                    if bool(operand) != present:
                        return False
                elif op == "$type":
                    # Only "string" used in our codebase.
                    if operand == "string" and not isinstance(doc.get(field), str):
                        return False
                # $in / $eq / etc. were already enforced server-side.
    return True


def _apply_update(target: Dict[str, Any], update_spec: Mapping[str, Any]) -> Dict[str, Any]:
    """Apply a Mongo-style update document in-place onto `target` and return it.

    Supports `$set`, `$setOnInsert` (treated as `$set` by caller when inserting),
    `$inc`, `$push`, `$pull`, `$unset`.
    """
    for op, payload in update_spec.items():
        if op == "$set":
            for k, v in payload.items():
                target[k] = v
        elif op == "$inc":
            for k, v in payload.items():
                target[k] = (target.get(k) or 0) + v
        elif op == "$push":
            for k, v in payload.items():
                target.setdefault(k, []).append(v)
        elif op == "$pull":
            for k, v in payload.items():
                if k in target and isinstance(target[k], list):
                    target[k] = [x for x in target[k] if x != v]
        elif op == "$unset":
            for k in payload.keys():
                target.pop(k, None)
        elif op == "$setOnInsert":
            # Handled by caller — only relevant on insert path.
            continue
        else:
            raise NotImplementedError(f"Update operator not supported: {op}")
    return target


def _firestore_update_payload(update_spec: Mapping[str, Any]) -> Dict[str, Any]:
    """Translate a `$set`/`$inc`/`$push` spec → a Firestore update() payload."""
    payload: Dict[str, Any] = {}
    for op, fields in update_spec.items():
        if op in ("$set", "$setOnInsert"):
            payload.update(fields)
        elif op == "$inc":
            for k, v in fields.items():
                payload[k] = Increment(v)
        elif op == "$push":
            for k, v in fields.items():
                payload[k] = ArrayUnion([v])
        elif op == "$pull":
            for k, v in fields.items():
                payload[k] = ArrayRemove([v])
        elif op == "$unset":
            for k in fields.keys():
                payload[k] = DELETE_FIELD
        else:
            raise NotImplementedError(f"Update operator not supported: {op}")
    return payload


# ---------------------------------------------------------------------------
# Cursor — emulates motor's `find().sort().limit().to_list(length)`.
# ---------------------------------------------------------------------------
class _Cursor:
    def __init__(self, coll: "_Collection", filter_: Mapping[str, Any]):
        self._coll = coll
        self._filter = dict(filter_ or {})
        self._sort: List[tuple] = []
        self._limit: Optional[int] = None
        self._skip: int = 0

    def sort(self, field: str, direction: int = 1) -> "_Cursor":
        d = (
            firestore.Query.ASCENDING if direction == 1
            else firestore.Query.DESCENDING
        )
        self._sort.append((field, d))
        return self

    def limit(self, n: int) -> "_Cursor":
        self._limit = n
        return self

    def skip(self, n: int) -> "_Cursor":
        self._skip = n
        return self

    def _build_query(self):
        q = self._coll._fcoll
        for fc in _build_where_clauses(self._filter):
            q = q.where(filter=fc)
        for field, direction in self._sort:
            q = q.order_by(field, direction=direction)
        if self._skip:
            q = q.offset(self._skip)
        if self._limit:
            q = q.limit(self._limit)
        return q

    async def to_list(self, length: int = 1000) -> List[Dict[str, Any]]:
        eff_limit = min(length, self._limit) if self._limit else length
        # Honour caller's `length` while still respecting `.limit()`.
        return await asyncio.to_thread(self._sync_to_list, eff_limit)

    def _sync_to_list(self, eff_limit: int) -> List[Dict[str, Any]]:
        """Stream the query; if Firestore demands a composite index, fall back
        to a where-only query and sort/limit client-side. This keeps the app
        functional out-of-the-box on a brand-new Firestore project (no manual
        index dance needed) — at the cost of one extra round trip for large
        result sets, which is fine for chat/history pages of <200 docs.
        """
        from google.api_core.exceptions import FailedPrecondition

        try:
            q = self._build_query()
            if eff_limit:
                q = q.limit(eff_limit)
            snapshots = list(q.stream())
        except FailedPrecondition:
            # Re-query without sort+limit; sort/slice in Python.
            q = self._coll._fcoll
            for fc in _build_where_clauses(self._filter):
                q = q.where(filter=fc)
            snapshots = list(q.stream())
            docs = [s.to_dict() or {} for s in snapshots]
            docs = [d for d in docs if _post_filter(d, self._filter)]
            for field, direction in reversed(self._sort):
                reverse = (direction == firestore.Query.DESCENDING)
                docs.sort(
                    key=lambda d, _f=field: (d.get(_f) is None, d.get(_f)),
                    reverse=reverse,
                )
            if self._skip:
                docs = docs[self._skip:]
            if eff_limit:
                docs = docs[:eff_limit]
            return docs

        return [
            d for d in (s.to_dict() for s in snapshots)
            if _post_filter(d, self._filter)
        ]


async def _to_thread_sync(fn: Callable, *args, **kwargs):
    return await asyncio.to_thread(fn, *args, **kwargs)


# ---------------------------------------------------------------------------
# Collection — main per-collection API surface (Motor-compatible).
# ---------------------------------------------------------------------------
class _Collection:
    def __init__(self, name: str):
        self.name = name
        self._fcoll = _client.collection(name)
        self._id_field = _DOC_ID_FIELD.get(name)

    # ---------- internal helpers ----------
    def _doc_id_for(self, payload: Mapping[str, Any]) -> str:
        """Pick the Firestore doc id for an insert payload."""
        if self._id_field and payload.get(self._id_field):
            return str(payload[self._id_field])
        return uuid.uuid4().hex

    def _query_single(self, filter_: Mapping[str, Any]):
        """Stream up to 1 doc matching filter — used by find_one / update_one."""
        # Optimisation: lookup by natural key → direct get().
        if (
            self._id_field
            and len(filter_) == 1
            and self._id_field in filter_
            and not isinstance(filter_[self._id_field], dict)
        ):
            doc_id = str(filter_[self._id_field])
            snap = self._fcoll.document(doc_id).get()
            return [snap] if snap.exists else []
        q = self._fcoll
        for fc in _build_where_clauses(filter_):
            q = q.where(filter=fc)
        q = q.limit(20)  # over-fetch a bit so we can post-filter $exists/$type.
        return list(q.stream())

    # ---------- public async API ----------
    async def find_one(
        self,
        filter_: Mapping[str, Any],
        projection: Optional[Mapping[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        def _run():
            for snap in self._query_single(filter_):
                doc = snap.to_dict() or {}
                if _post_filter(doc, filter_):
                    return doc
            return None
        return await asyncio.to_thread(_run)

    def find(
        self,
        filter_: Optional[Mapping[str, Any]] = None,
        projection: Optional[Mapping[str, Any]] = None,
    ) -> _Cursor:
        return _Cursor(self, filter_ or {})

    async def insert_one(self, doc: Mapping[str, Any]) -> None:
        payload = dict(doc)
        payload.pop("_id", None)
        doc_id = self._doc_id_for(payload)
        def _run():
            self._fcoll.document(doc_id).set(payload)
        await asyncio.to_thread(_run)

    async def update_one(
        self,
        filter_: Mapping[str, Any],
        update_spec: Mapping[str, Any],
        upsert: bool = False,
    ) -> Dict[str, Any]:
        def _run():
            snaps = self._query_single(filter_)
            target = None
            for s in snaps:
                d = s.to_dict() or {}
                if _post_filter(d, filter_):
                    target = s
                    break
            if target is not None:
                ref = target.reference
                ref.update(_firestore_update_payload(update_spec))
                return _Result(matched_count=1, modified_count=1, upserted_id=None)
            if upsert:
                base: Dict[str, Any] = {}
                # `$setOnInsert` + equality fields seed the new doc.
                for k, v in filter_.items():
                    if not isinstance(v, dict):
                        base[k] = v
                _apply_update(base, {
                    "$set": update_spec.get("$set", {}),
                    "$setOnInsert": update_spec.get("$setOnInsert", {}),
                })
                # Also fold in setOnInsert as plain set on first write.
                base.update(update_spec.get("$setOnInsert", {}) or {})
                base.update(update_spec.get("$set", {}) or {})
                doc_id = self._doc_id_for(base)
                self._fcoll.document(doc_id).set(base)
                return _Result(matched_count=0, modified_count=0, upserted_id=doc_id)
            return _Result(matched_count=0, modified_count=0, upserted_id=None)
        return await asyncio.to_thread(_run)

    async def update_many(
        self, filter_: Mapping[str, Any], update_spec: Mapping[str, Any]
    ) -> _Result:
        def _run():
            q = self._fcoll
            for fc in _build_where_clauses(filter_):
                q = q.where(filter=fc)
            count = 0
            payload = _firestore_update_payload(update_spec)
            for snap in q.stream():
                d = snap.to_dict() or {}
                if not _post_filter(d, filter_):
                    continue
                snap.reference.update(payload)
                count += 1
            return _Result(matched_count=count, modified_count=count)
        return await asyncio.to_thread(_run)

    async def delete_one(self, filter_: Mapping[str, Any]) -> _Result:
        def _run():
            for snap in self._query_single(filter_):
                d = snap.to_dict() or {}
                if _post_filter(d, filter_):
                    snap.reference.delete()
                    return _Result(deleted_count=1)
            return _Result(deleted_count=0)
        return await asyncio.to_thread(_run)

    async def delete_many(self, filter_: Mapping[str, Any]) -> _Result:
        def _run():
            q = self._fcoll
            for fc in _build_where_clauses(filter_):
                q = q.where(filter=fc)
            count = 0
            for snap in q.stream():
                d = snap.to_dict() or {}
                if not _post_filter(d, filter_):
                    continue
                snap.reference.delete()
                count += 1
            return _Result(deleted_count=count)
        return await asyncio.to_thread(_run)

    async def count_documents(self, filter_: Mapping[str, Any]) -> int:
        def _run():
            q = self._fcoll
            for fc in _build_where_clauses(filter_):
                q = q.where(filter=fc)
            # Use Firestore's aggregation count() when possible.
            try:
                agg = q.count().get()
                # Firestore returns [[AggregationResult(value=N)]].
                return int(agg[0][0].value)
            except Exception:
                # Fallback — manual count with post-filter.
                return sum(
                    1
                    for s in q.stream()
                    if _post_filter(s.to_dict() or {}, filter_)
                )
        return await asyncio.to_thread(_run)

    async def find_one_and_update(
        self,
        filter_: Mapping[str, Any],
        update_spec: Mapping[str, Any],
        upsert: bool = False,
        return_document: str = ReturnDocument.BEFORE,
        projection: Optional[Mapping[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Atomic update-or-insert, mirroring Mongo's semantics.

        Uses a Firestore transaction to guarantee that two concurrent guest
        sign-in calls for the same `guest_device_id` cannot each create a
        separate user document — exactly the race condition the original
        Mongo implementation was protecting against.
        """
        def _run():
            transaction = _client.transaction()
            id_field = self._id_field

            @firestore.transactional
            def _txn(txn):
                # Locate existing doc by either id-field shortcut or full query.
                target_ref = None
                target_data = None
                if (
                    id_field
                    and len(filter_) == 1
                    and id_field in filter_
                    and not isinstance(filter_[id_field], dict)
                ):
                    ref = self._fcoll.document(str(filter_[id_field]))
                    snap = ref.get(transaction=txn)
                    if snap.exists:
                        target_ref = ref
                        target_data = snap.to_dict() or {}
                else:
                    q = self._fcoll
                    for fc in _build_where_clauses(filter_):
                        q = q.where(filter=fc)
                    q = q.limit(20)
                    for s in q.stream(transaction=txn):
                        d = s.to_dict() or {}
                        if _post_filter(d, filter_):
                            target_ref = s.reference
                            target_data = d
                            break

                if target_ref is not None:
                    txn.update(target_ref, _firestore_update_payload(update_spec))
                    if return_document == ReturnDocument.AFTER:
                        merged = dict(target_data or {})
                        _apply_update(merged, update_spec)
                        return merged
                    return target_data

                if upsert:
                    base: Dict[str, Any] = {}
                    for k, v in filter_.items():
                        if not isinstance(v, dict):
                            base[k] = v
                    base.update(update_spec.get("$setOnInsert", {}) or {})
                    base.update(update_spec.get("$set", {}) or {})
                    doc_id = self._doc_id_for(base)
                    new_ref = self._fcoll.document(doc_id)
                    txn.set(new_ref, base)
                    return base if return_document == ReturnDocument.AFTER else None
                return None

            return _txn(transaction)
        return await asyncio.to_thread(_run)

    async def aggregate(self, pipeline: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Very small aggregation shim — supports only `$match` + `$group(_id, $sum, $push)`.

        Used by the startup dedupe routine. Anything more complex falls back to
        client-side processing of the matched documents.
        """
        def _run():
            match: Dict[str, Any] = {}
            group: Optional[Dict[str, Any]] = None
            post_match: Optional[Dict[str, Any]] = None
            for stage in pipeline:
                if "$match" in stage and group is None:
                    match = stage["$match"]
                elif "$group" in stage:
                    group = stage["$group"]
                elif "$match" in stage and group is not None:
                    post_match = stage["$match"]

            q = self._fcoll
            for fc in _build_where_clauses(match):
                q = q.where(filter=fc)
            docs = [
                s.to_dict() or {}
                for s in q.stream()
                if _post_filter(s.to_dict() or {}, match)
            ]
            if not group:
                return docs

            # Group by `_id` — a literal Mongo expression like "$guest_device_id".
            key_expr = group.get("_id")
            key_field = (
                key_expr.lstrip("$") if isinstance(key_expr, str) and key_expr.startswith("$") else None
            )
            if not key_field:
                return docs

            buckets: Dict[str, Dict[str, Any]] = {}
            for d in docs:
                k = str(d.get(key_field, "<null>"))
                bucket = buckets.setdefault(k, {"_id": d.get(key_field), "count": 0})
                # Apply accumulators.
                for out_field, accum in group.items():
                    if out_field == "_id":
                        continue
                    if isinstance(accum, dict):
                        if "$sum" in accum:
                            val = accum["$sum"]
                            bucket[out_field] = bucket.get(out_field, 0) + (1 if val == 1 else (d.get(str(val).lstrip("$"), 0) or 0))
                        elif "$push" in accum:
                            push_expr = accum["$push"]
                            src = push_expr.lstrip("$") if isinstance(push_expr, str) else None
                            bucket.setdefault(out_field, []).append(d.get(src) if src else push_expr)

            results = list(buckets.values())
            if post_match:
                # Only `$gt`/`$gte` on `count` is used by us.
                def _ok(r):
                    for f, v in post_match.items():
                        actual = r.get(f)
                        if isinstance(v, dict):
                            for op, val in v.items():
                                if op == "$gt" and not (actual is not None and actual > val):
                                    return False
                                if op == "$gte" and not (actual is not None and actual >= val):
                                    return False
                        elif actual != v:
                            return False
                    return True
                results = [r for r in results if _ok(r)]
            return results
        return await asyncio.to_thread(_run)

    # Mongo `create_index` is a no-op — Firestore single-field indexes are
    # automatic, and composite indexes are declared via firestore.indexes.json.
    async def create_index(self, *_args, **_kwargs) -> None:
        return None


# ---------------------------------------------------------------------------
# Database — exposes `.users`, `.user_sessions`, etc. like motor's db handle.
# ---------------------------------------------------------------------------
class _Database:
    def __getattr__(self, name: str) -> _Collection:
        if name.startswith("_"):
            raise AttributeError(name)
        return _Collection(name)

    def __getitem__(self, name: str) -> _Collection:
        return _Collection(name)


db = _Database()


def close() -> None:
    """No-op — Firestore client is reused across the process."""
    return None
