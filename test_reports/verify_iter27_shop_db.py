"""DB cleanup/check for iteration 27 shop verification.

Removes the temporary QA supplier product created during browser testing and
prints fixture/sample supplier_products counts. This is a test artifact only.
"""

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


QA_PREFIX = "QA Supplier Product 20260726 1749"


def fixture_ids():
    import sys

    sys.path.insert(0, "/app/backend")
    from seed_store_fixtures import SUPPLIER_FIXTURES

    ids = []
    for supplier in SUPPLIER_FIXTURES:
        for product in supplier.get("products", []):
            ids.append(f"{supplier['id']}::{product['name']}".replace(" ", "_")[:80])
    return ids


async def main():
    load_dotenv(Path("/app/backend/.env"))
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    qa_deleted = await db.supplier_products.delete_many({"name": {"$regex": f"^{QA_PREFIX}"}})
    ids = fixture_ids()
    fixture_count = await db.supplier_products.count_documents({"id": {"$in": ids}})
    visible_count = await db.supplier_products.count_documents({
        "is_active": True,
        "is_deleted": {"$ne": True},
    })
    total_count = await db.supplier_products.count_documents({})
    print({
        "qa_hard_deleted": qa_deleted.deleted_count,
        "fixture_supplier_products_count": fixture_count,
        "visible_supplier_products_count": visible_count,
        "total_supplier_products_count": total_count,
    })
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
