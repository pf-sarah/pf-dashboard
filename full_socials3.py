import requests, json, time, csv

env = {}
with open('.env.local') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"')

PF_API_URL = env['PF_API_URL']
jwt = requests.post(PF_API_URL + '/Authentication/Login', json={'email': env['PF_API_EMAIL'], 'password': env['PF_API_PASSWORD']}).json()['jwt']
headers = {'Authorization': 'Bearer ' + jwt}

print('Fetching all UUIDs...')
all_items = []
for page in range(1, 500):
    res = requests.post(PF_API_URL + '/OrderProducts/Search', headers=headers, json={'searchTerm': ' ', 'pageNumber': page, 'pageSize': 50})
    items = res.json().get('orderProducts') or res.json().get('items') or []
    if not items:
        break
    all_items += items
    if len(items) < 50:
        break
    time.sleep(0.05)

print('Total orders: ' + str(len(all_items)))

# Filter to only orders we haven't scanned yet (above 27084)
existing = json.load(open('full_socials_output.json'))
done_orders = set(r['order'] for r in existing)

remaining = [i for i in all_items if str(i.get('shopifyOrderNumber','')) not in done_orders]
print('Already scanned: ' + str(len(done_orders)) + ' | Remaining: ' + str(len(remaining)))

found = list(existing)
for i, item in enumerate(remaining):
    uuid = item.get('uuid')
    if not uuid:
        continue
    try:
        d = requests.get(PF_API_URL + '/OrderProducts/Details/' + uuid, headers=headers).json()
        s = d.get('socialMediaLinks')
        if s:
            found.append({
                'order': str(item.get('shopifyOrderNumber') or ''),
                'client': str(item.get('clientFirstName') or '') + ' ' + str(item.get('clientLastName') or ''),
                'email': str(item.get('clientEmail') or ''),
                'social': str(s)
            })
    except:
        pass
    if (i + 1) % 500 == 0:
        print('Progress: ' + str(i+1) + '/' + str(len(remaining)) + ' | Total found: ' + str(len(found)))
        json.dump(found, open('full_socials_output.json','w'), indent=2)
    time.sleep(0.08)

json.dump(found, open('full_socials_output.json','w'), indent=2)

with open('vendors.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Order', 'Client', 'Email', 'Social/Vendor Info'])
    for r in found:
        w.writerow([r.get('order',''), r.get('client',''), r.get('email',''), r.get('social','')])

print('Done! Total with socials: ' + str(len(found)))
print('Saved full_socials_output.json and vendors.csv')
