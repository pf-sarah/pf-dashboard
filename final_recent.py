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

existing = json.load(open('full_socials_output.json'))
done_orders = set(r['order'] for r in existing)

# Fetch all UUIDs and filter to order numbers 40000+
print('Fetching UUIDs for recent orders...')
recent_items = []
for page in range(1, 800):
    res = requests.post(PF_API_URL + '/OrderProducts/Search', headers=headers, json={'searchTerm': ' ', 'pageNumber': page, 'pageSize': 50})
    items = res.json().get('orderProducts') or res.json().get('items') or []
    if not items:
        break
    for item in items:
        num = item.get('shopifyOrderNumber','')
        if str(num).isdigit() and int(num) >= 40000:
            recent_items.append(item)
    if len(items) < 50:
        break
    time.sleep(0.05)

print('Found ' + str(len(recent_items)) + ' orders with number 40000+')
new_items = [i for i in recent_items if str(i.get('shopifyOrderNumber','')) not in done_orders]
print('Not yet scanned: ' + str(len(new_items)))

found = list(existing)
new_found = 0

for i, item in enumerate(new_items):
    uuid = item.get('uuid')
    order_num = str(item.get('shopifyOrderNumber',''))
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
                'social': str(s),
                'orderDate': str(item.get('orderDate') or '')
            })
            new_found += 1
            print('Found: #' + order_num + ' | ' + str(s)[:60])
        done_orders.add(order_num)
    except:
        pass
    if (i + 1) % 100 == 0:
        print('Progress: ' + str(i+1) + '/' + str(len(new_items)) + ' | New: ' + str(new_found))
        json.dump(found, open('full_socials_output.json','w'), indent=2)
    time.sleep(0.08)

json.dump(found, open('full_socials_output.json','w'), indent=2)

with open('vendors.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Order', 'Client', 'Email', 'Social/Vendor Info', 'Order Date'])
    for r in sorted(found, key=lambda x: int(x['order']) if x.get('order','').isdigit() else 0):
        w.writerow([r.get('order',''), r.get('client',''), r.get('email',''), r.get('social',''), r.get('orderDate','')])

print('Done! Added ' + str(new_found) + ' new | Total: ' + str(len(found)))
print('vendors.csv updated')
