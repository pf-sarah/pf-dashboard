#!/usr/bin/env python3
"""
Pull vendor information from PF API order details.
Run from: /Users/sarahferrell/Documents/pf-dashboard
Requires: PF_API_URL, PF_API_EMAIL, PF_API_PASSWORD in .env.local
"""

import requests
import json
import os
import time
from collections import defaultdict

# ── Load env vars from .env.local ──────────────────────────────────────────
env_path = os.path.join(os.path.dirname(__file__), ".env.local")
env = {}
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')

PF_API_URL = env.get("PF_API_URL", "https://pressedfloralapi.azurewebsites.net")
PF_EMAIL = env.get("PF_API_EMAIL", "")
PF_PASSWORD = env.get("PF_API_PASSWORD", "")

if not PF_EMAIL or not PF_PASSWORD:
    print("❌ Missing PF_API_EMAIL or PF_API_PASSWORD in .env.local")
    exit(1)

# ── Auth ───────────────────────────────────────────────────────────────────
print("🔐 Authenticating...")
auth_res = requests.post(
    f"{PF_API_URL}/Authentication/Login",
    json={"email": PF_EMAIL, "password": PF_PASSWORD}
)
auth_res.raise_for_status()
jwt = auth_res.json().get("jwt")
headers = {"Authorization": f"Bearer {jwt}"}
print("✅ Authenticated\n")

# ── Fetch all pipeline orders via Search ───────────────────────────────────
print("📦 Fetching all pipeline orders via Search...")
all_uuids = []
page = 1
while True:
    res = requests.post(
        f"{PF_API_URL}/OrderProducts/Search",
        headers=headers,
        json={"searchTerm": " ", "pageNumber": page, "pageSize": 50}
    )
    res.raise_for_status()
    data = res.json()
    items = data.get("orderProducts") or data.get("items") or data.get("results") or []
    if not items:
        break
    all_uuids.extend([(item.get("uuid") or item.get("id"), item.get("orderNumber") or item.get("orderNum")) for item in items])
    total = data.get("totalCount") or data.get("total") or 0
    print(f"  Page {page}: {len(items)} orders (total so far: {len(all_uuids)}/{total})")
    if len(all_uuids) >= total or len(items) < 50:
        break
    page += 1
    time.sleep(0.1)

print(f"\n✅ Found {len(all_uuids)} total UUIDs\n")

# ── Fetch details and look for vendor fields ───────────────────────────────
print("🔍 Fetching details for first 20 orders to discover vendor field structure...")
print("   (we'll do a full scan after we confirm the field names)\n")

sample_with_vendors = []
all_vendor_field_names = set()
first_detail = None

for i, (uuid, order_num) in enumerate(all_uuids[:20]):
    if not uuid:
        continue
    try:
        res = requests.get(f"{PF_API_URL}/OrderProducts/Details/{uuid}", headers=headers)
        res.raise_for_status()
        detail = res.json()
        if first_detail is None:
            first_detail = detail
        # Find any keys containing "vendor"
        def find_vendor_keys(obj, path=""):
            keys = []
            if isinstance(obj, dict):
                for k, v in obj.items():
                    full_path = f"{path}.{k}" if path else k
                    if "vendor" in k.lower():
                        keys.append((full_path, v))
                    keys.extend(find_vendor_keys(v, full_path))
            elif isinstance(obj, list):
                for idx, item in enumerate(obj):
                    keys.extend(find_vendor_keys(item, f"{path}[{idx}]"))
            return keys

        vendor_keys = find_vendor_keys(detail)
        if vendor_keys:
            all_vendor_field_names.update(k for k, v in vendor_keys)
            sample_with_vendors.append({
                "uuid": uuid,
                "order_num": order_num,
                "vendor_fields": {k: v for k, v in vendor_keys if v}
            })
    except Exception as e:
        print(f"  ⚠️  Error on {uuid}: {e}")
    time.sleep(0.05)

print(f"📋 Vendor-related field names found in first 20 orders:")
if all_vendor_field_names:
    for f in sorted(all_vendor_field_names):
        print(f"   {f}")
else:
    print("   (none found with 'vendor' in key name)")

print(f"\n🗂  First detail object top-level keys:")
if first_detail:
    for k in first_detail.keys():
        print(f"   {k}: {json.dumps(first_detail[k])[:120]}")

# ── Full scan for vendor data ──────────────────────────────────────────────
print(f"\n\n🚀 Running full scan of all {len(all_uuids)} orders for vendor data...")
print("   This will take a few minutes...\n")

vendors_found = []  # list of {order_num, uuid, vendor_info}
BATCH = 200  # scan first 200 to get a good sample; change to len(all_uuids) for full run

for i, (uuid, order_num) in enumerate(all_uuids[:BATCH]):
    if not uuid:
        continue
    try:
        res = requests.get(f"{PF_API_URL}/OrderProducts/Details/{uuid}", headers=headers)
        res.raise_for_status()
        detail = res.json()

        # Try common vendor field patterns
        vendor_info = {}
        
        # Direct vendor fields
        for key in ["vendors", "vendor", "weddingVendors", "vendorList", "eventVendors"]:
            if key in detail and detail[key]:
                vendor_info[key] = detail[key]
        
        # Check nested in order or customer
        for top_key in ["order", "customer", "event", "orderDetails"]:
            if top_key in detail and isinstance(detail[top_key], dict):
                for key in detail[top_key]:
                    if "vendor" in key.lower() and detail[top_key][key]:
                        vendor_info[f"{top_key}.{key}"] = detail[top_key][key]

        # Also look for any field with non-empty vendor-like data
        def deep_vendor_search(obj, path=""):
            results = {}
            if isinstance(obj, dict):
                for k, v in obj.items():
                    full_path = f"{path}.{k}" if path else k
                    if "vendor" in k.lower() and v:
                        results[full_path] = v
                    results.update(deep_vendor_search(v, full_path))
            elif isinstance(obj, list) and len(obj) < 20:
                for idx, item in enumerate(obj):
                    results.update(deep_vendor_search(item, f"{path}[{idx}]"))
            return results

        deep = deep_vendor_search(detail)
        vendor_info.update(deep)

        if vendor_info:
            vendors_found.append({
                "order_num": order_num,
                "uuid": uuid,
                "vendor_info": vendor_info
            })

    except Exception as e:
        pass

    if (i + 1) % 25 == 0:
        print(f"  Scanned {i+1}/{BATCH}... ({len(vendors_found)} with vendor data so far)")
    time.sleep(0.05)

print(f"\n✅ Scan complete. {len(vendors_found)} orders had vendor data out of {BATCH} scanned.\n")

# ── Output results ─────────────────────────────────────────────────────────
if vendors_found:
    print("=" * 60)
    print("ORDERS WITH VENDOR INFORMATION")
    print("=" * 60)
    for item in vendors_found:
        print(f"\nOrder #{item['order_num']} | UUID: {item['uuid']}")
        print(json.dumps(item["vendor_info"], indent=2))
    
    # Save to file
    output_path = os.path.join(os.path.dirname(__file__), "vendor_data_output.json")
    with open(output_path, "w") as f:
        json.dump(vendors_found, f, indent=2)
    print(f"\n💾 Saved to vendor_data_output.json")
else:
    print("ℹ️  No vendor fields found in any orders scanned.")
    print("    The field might use a different name — check the top-level keys printed above.")
    print("    Or vendor info might be in a sub-object like 'orderProductUploads'.\n")
    
    if first_detail:
        print("Full structure of first order detail:")
        print(json.dumps(first_detail, indent=2)[:3000])
