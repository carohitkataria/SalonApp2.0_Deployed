"""
Predefined Services and Packages for Salon
------------------------------------------
Per product decision (Jul 2026):
Only a minimal set of "General" services is auto-seeded when a new salon is
onboarded. All other pre-loaded categories were removed to avoid cluttering
the salon's service catalog with items they may not offer. The salon owner
is expected to add / upload their own service menu through the Offerings
module.
"""

PREDEFINED_SERVICES = [
    # GENERAL — starter set only. Salons can enable/disable, delete, or add more.
    {"service_name": "Haircut", "category": "General", "base_price": 200, "price_type": "fixed", "default_duration": 30, "gender_tag": "Unisex"},
    {"service_name": "Hair Wash", "category": "General", "base_price": 150, "price_type": "fixed", "default_duration": 15, "gender_tag": "Unisex"},
    {"service_name": "Shave", "category": "General", "base_price": 100, "price_type": "fixed", "default_duration": 20, "gender_tag": "Men"},
    {"service_name": "Beard Trim", "category": "General", "base_price": 120, "price_type": "fixed", "default_duration": 15, "gender_tag": "Men"},
    {"service_name": "Head Massage", "category": "General", "base_price": 250, "price_type": "fixed", "default_duration": 20, "gender_tag": "Unisex"},
    {"service_name": "Threading", "category": "General", "base_price": 60, "price_type": "fixed", "default_duration": 10, "gender_tag": "Women"},
]

# No auto-created packages — salons build their own combos.
PREDEFINED_PACKAGES = []
