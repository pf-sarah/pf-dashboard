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

found = list(existing)
new_found = 0

for page in range(1, 100):
    res = requests.post(PF_API_URL + '/OrderProducts/Search', headers=headers, json={'searchTerm': ' ', 'pageNumber': page, 'pageSize': 50})
    items = res.json().get('orderProducts') or res.json().get('items') or []
    if not items:
        break

    order_nums = [int(i.get('shopifyOrderNumber',0)) for i in items if str(i.get('shopifyOrderNumber','')).isdigit()]
    max_order = max(order_nums) if order_nums else 0
    min_order = min(order_nums) if order_nums else 0
    print('Page ' + str(page) + ' | orders #' + str(min_order) + '-#' + str(max_order))

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
                print('  Found: #' + order_num + ' | ' + str(item.get('clientFirstName','')) + ' | ' + str(s)[:80])
            done_orders.add(order_num)
        except:
            pass
        time.sleep(0.08)

    if len(items) < 50:
        break
    time.sleep(0.1)

json.dump(found, open('full_socials_output.json','w'), indent=2)

with open('vendors.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Order', 'Client', 'Email', 'Social/Vendor Info'])
    for r in sorted(found, key=lambda x: int(x['order']) if x.get('order','').isdigit() else 0):
        w.writerow([r.get('order',''), r.get('client',''), r.get('email',''), r.get('social','')])

print('Done! Added ' + str(new_found) + ' new | Total: ' + str(len(found)))
