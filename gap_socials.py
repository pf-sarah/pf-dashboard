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

print('Scanning for orders above #30000...')
for page in range(1, 800):
    res = requests.post(PF_API_URL + '/OrderProducts/Search', headers=headers, json={'searchTerm': ' ', 'pageNumber': page, 'pageSize': 50})
    data = res.json()
    items = data.get('orderProducts') or data.get('items') or []
    if not items:
        break

    order_nums = [int(i.get('shopifyOrderNumber',0)) for i in items if str(i.get('shopifyOrderNumber','')).isdigit()]
    if not order_nums:
        if len(items) < 50:
            break
        time.sleep(0.05)
        continue

    max_o = max(order_nums)
    min_o = min(order_nums)

    gap_items = [i for i in items if str(i.get('shopifyOrderNumber','')).isdigit() and int(i.get('shopifyOrderNumber',0)) >= 30000 and str(i.get('shopifyOrderNumber','')) not in done_orders]

    if gap_items:
        print('Page ' + str(page) + ' | #' + str(min_o) + '-#' + str(max_o) + ' | ' + str(len(gap_items)) + ' to scan')
        for item in gap_items:
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
                    print('  Found: #' + order_num + ' | ' + str(s)[:60])
                done_orders.add(order_num)
            except:
                pass
            time.sleep(0.08)
        json.dump(found, open('full_socials_output.json','w'), indent=2)
    elif page % 50 == 0:
        print('Page ' + str(page) + ' | #' + str(min_o) + '-#' + str(max_o) + ' (no new orders)')

    if len(items) < 50:
        break
    time.sleep(0.05)

json.dump(found, open('full_socials_output.json','w'), indent=2)

with open('vendors.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Order', 'Client', 'Email', 'Social/Vendor Info', 'Order Date'])
    for r in sorted(found, key=lambda x: int(x['order']) if x.get('order','').isdigit() else 0):
        w.writerow([r.get('order',''), r.get('client',''), r.get('email',''), r.get('social',''), r.get('orderDate','')])

print('Done! Added ' + str(new_found) + ' | Total: ' + str(len(found)))
print('vendors.csv updated')
