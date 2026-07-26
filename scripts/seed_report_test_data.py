"""Seed a few salon tokens/appointments and shop orders for report testing.

Idempotent: skips creation if tokens with these ids already exist.
Runs in isolation with `python /app/scripts/seed_report_test_data.py`.
"""
import asyncio, os, sys, uuid, random
from datetime import datetime, timedelta, timezone

sys.path.insert(0, '/app/backend')
os.environ.setdefault('MONGO_URL', 'mongodb://localhost:27017')
os.environ.setdefault('DB_NAME', 'test_database')

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


SALON_ID = 'a9bb3490-155e-4a9e-94e2-5cf3adf4efeb'


async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    services = await db.services.find({'salon_id': SALON_ID}).to_list(length=20)
    if not services:
        print('No services — aborting'); return
    barbers = await db.barbers.find({'salon_id': SALON_ID}).to_list(length=20)
    if not barbers:
        print('No barbers — aborting'); return
    branch_id = (await db.branches.find_one({'salon_id': SALON_ID}) or {}).get('id', 'default')

    # Delete previously seeded tokens so counts are stable across re-runs
    await db.tokens.delete_many({'salon_id': SALON_ID, 'seed_source': 'reports_test'})

    now = datetime.now(timezone.utc)
    payment_modes = ['cash', 'upi', 'card', 'wallet']
    sources = ['owner', 'online', 'qr', 'direct_invoice']
    statuses = ['completed', 'completed', 'completed', 'completed', 'completed',
                'completed', 'in_progress', 'no_show', 'cancelled', 'pending']

    tokens_created = 0
    for i in range(20):
        day_offset = random.randint(0, 20)  # spread across current month
        created_at = now - timedelta(days=day_offset, hours=random.randint(0, 12))
        svc = random.choice(services)
        barber = random.choice(barbers)
        status = random.choice(statuses)

        price = float(svc.get('price', 300) or 300)
        # Split into service + optional product/addon
        addon = 0.0
        product = 0.0
        if random.random() > 0.6:
            addon = round(random.choice([100, 150, 200]), 2)
        if random.random() > 0.7:
            product = round(random.choice([90, 150, 250]), 2)
        subtotal = price + addon + product
        gst = round(subtotal * 0.18, 2)
        total = round(subtotal + gst, 2)

        payment_mode = random.choice(payment_modes)
        source = random.choice(sources)

        token = {
            'id': str(uuid.uuid4()),
            'seed_source': 'reports_test',
            'salon_id': SALON_ID,
            'branch_id': branch_id,
            'date': created_at.strftime('%Y-%m-%d'),
            'customer_name': f'Guest {i+1}',
            'customer_phone': f'99000000{i:02d}',
            'services': [{
                'id': svc['id'], 'service_id': svc['id'],
                'service_name': svc.get('service_name') or svc.get('name'),
                'name': svc.get('service_name') or svc.get('name'),
                'category': svc.get('category', 'Haircut'),
                'price': price, 'total_price': price,
                'barber_id': barber['id'], 'barber_name': barber['name'],
                'is_addon': False,
            }],
            'barber_id': barber['id'],
            'barber_name': barber['name'],
            'status': status,
            'service_price': price,
            'addon_price': addon,
            'product_price': product,
            'discount_amount': random.choice([0, 0, 0, 50, 100]),
            'subtotal': subtotal,
            'gst_amount': gst,
            'total_amount': total,
            'total_price': total,
            'payment_mode': payment_mode,
            'payment_status': 'paid' if status == 'completed' else 'pending',
            'source': source,
            'rating': random.choice([5, 5, 5, 4, 4, 4, 3, 5]) if status == 'completed' else None,
            'is_first_visit': i in (2, 4, 7),
            'created_at': created_at.isoformat(),
            'completed_at': created_at.isoformat() if status == 'completed' else None,
            'scheduled_at': created_at.isoformat(),
            'wait_time_minutes': random.randint(2, 25),
            'check_in_at': created_at.isoformat() if status in ('completed', 'in_progress') else None,
            'called_at': (created_at + timedelta(minutes=random.randint(2, 20))).isoformat() if status in ('completed', 'in_progress') else None,
            'served_at': (created_at + timedelta(minutes=random.randint(5, 30))).isoformat() if status == 'completed' else None,
        }
        await db.tokens.insert_one(token)
        tokens_created += 1

    print(f'Seeded {tokens_created} tokens for salon {SALON_ID}')

    # Also seed a few store orders (so Products metric has data)
    await db.salon_store_orders.delete_many({'salon_id': SALON_ID, 'seed_source': 'reports_test'})
    products = await db.supplier_products.find({}).to_list(length=10)
    if products:
        for i in range(3):
            oi = str(uuid.uuid4())
            p = random.choice(products)
            qty = random.randint(1, 3)
            amt = qty * float(p.get('selling_price', 200))
            gst = round(amt * (float(p.get('gst_percent', 18))/100.0), 2)
            total = round(amt + gst, 2)
            await db.salon_store_orders.insert_one({
                'id': oi,
                'seed_source': 'reports_test',
                'salon_id': SALON_ID,
                'branch_id': branch_id,
                'date': (now - timedelta(days=random.randint(0, 10))).strftime('%Y-%m-%d'),
                'supplier_id': p['supplier_id'],
                'items': [{'product_id': p['id'], 'name': p['name'], 'brand': p.get('brand'), 'qty': qty,
                           'unit_price': p['selling_price'], 'total': amt}],
                'subtotal': amt,
                'gst_amount': gst,
                'total_amount': total,
                'status': random.choice(['placed', 'shipped', 'delivered']),
                'payment_mode': random.choice(['cod', 'prepaid']),
                'created_at': (now - timedelta(days=random.randint(0, 10))).isoformat(),
                'delivery_address': {'name': 'Salon Owner', 'city': 'Bangalore', 'state': 'KA', 'pincode': '560001'},
            })
        print('Seeded 3 shop orders')

    client.close()


if __name__ == '__main__':
    asyncio.run(main())
