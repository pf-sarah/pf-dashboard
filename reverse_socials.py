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

# First find the last page
print('Finding last page...')
last_page = 1
for page in range(1, 1000):
    res = requests.post(PF_API_URL + '/OrderProducts/Search', headers=headers, json={'searchTerm': ' ', 'pageNumber': page, 'pageSize': 50})
    items = res.json().get('orderProducts') or res.json().get('items') or []
    if not items or len(items) < 50:
        last_page = page
        print('Last page is: ' + str(last_page))
        break
    time.sleep(0.05)

existing = json.load(open('full_socials_output.json'))
done_orders = set(r['order'] for r in existing)
print('Already scanned: ' + str(len(done_orders)) + ' unique orders')

found = list(existing)
new_found = 0

for page in range(last_page, 0, -1):
    res = requests.post(PF_API_URL + '/OrderProducts/Search', headers=headers, json={'searchTerm': ' ', 'pageNumber': page, 'pageSize': 50})
    items = res.json().get('orderProducts') or res.json().get('items') or []
    if not items:
        continue

    order_nums = [int(i.get('shopifyOrderNumber',0)) for i in items if str(i.get('shopifyOrderNumber','')).isdigit()]
    max_order = max(order_nums) if order_nums else 0
    min_order = min(order_nums) if order_nums else 0

    for item in items:
        order_num = str(item.get('shopifyOrderNumber') or '')
        if order_num in done_orders:
            continue
        uuid = item.get('uuid')
        if not uuid:
            continue
        try:
            d = requests.get(PF_API_URL + '/OrderProducts/Details/' + uuid, headers=headers).json()
            s = d.get('socialMediaLinks')
            if s:
                found.append({
                    'order': order_num,
                    'client': str(item.get('clientFirstName') or '') + ' ' + str(item.get('clientLastName') or ''),
                    'email': str(item.get('clientEmail') or ''),
                    'social': str(s)
                })
                new_found += 1
                print('  Found: #' + order_num + ' | ' + str(item.get('clientFirstName','')) + ' | ' + str(s)[:60])
            done_orders.add(order_num)
        except:
            pass
        time.sleep(0.08)

    print('Page ' + str(page) + ' | orders #' + str(min_order) + '-#' + str(max_order) + ' | new socials so far: ' + str(new_found))

    if page % 50 == 0:
        json.dump(found, open('full_socials_output.json','w'), indent=2)
        print('  (checkpoint saved)')
    time.sleep(0.1)

json.dump(found, open('full_socials_output.json','w'), indent=2)

with open('vendors.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Order', 'Client', 'Email', 'Social/Vendor Info'])
    for r in sorted(found, key=lambda x: int(x['order']) if x.get('order','').isdigit() else 0):
        w.writerow([r.get('order',''), r.get('client',''), r.get('email',''), r.get('social','')])

print('Done! Total: ' + str(len(found)) + ' | Added: ' + str(new_found) + ' new')
print('vendors.csv updated and sorted by order number')
