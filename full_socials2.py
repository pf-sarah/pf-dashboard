import requests, json, time

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
for page in range(1, 300):
    res = requests.post(PF_API_URL + '/OrderProducts/Search', headers=headers, json={'searchTerm': ' ', 'pageNumber': page, 'pageSize': 50})
    items = res.json().get('orderProducts') or res.json().get('items') or []
    if not items:
        break
    all_items += items
    if len(items) < 50:
        break
    time.sleep(0.05)

print('Total orders: ' + str(len(all_items)))

found = []
for i, item in enumerate(all_items):
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
        print('Progress: ' + str(i+1) + '/' + str(len(all_items)) + ' | Found: ' + str(len(found)))
        json.dump(found, open('full_socials_output.json','w'), indent=2)
    time.sleep(0.08)

json.dump(found, open('full_socials_output.json','w'), indent=2)
print('Saved full_socials_output.json')
print('Total with socials: ' + str(len(found)))
for f in found:
    print('#' + f['order'] + ' | ' + f['client'] + ' | ' + f['email'] + ' | ' + f['social'])
