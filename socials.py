import requests, json, time

env = {}
with open('.env.local') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"')

PF_API_URL = env['PF_API_URL']
auth = requests.post(PF_API_URL + '/Authentication/Login', json={'email': env['PF_API_EMAIL'], 'password': env['PF_API_PASSWORD']})
jwt = auth.json()['jwt']
headers = {'Authorization': 'Bearer ' + jwt}

# Search returns top-level socialMediaLinks without needing Details
all_items = []
for page in range(1, 200):
    res = requests.post(PF_API_URL + '/OrderProducts/Search', headers=headers, json={'searchTerm': ' ', 'pageNumber': page, 'pageSize': 50})
    data = res.json()
    items = data.get('orderProducts') or data.get('items') or data.get('results') or []
    if not items:
        break
    all_items += items
    total = data.get('totalCount') or data.get('total') or '?'
    print('Page ' + str(page) + ': ' + str(len(all_items)) + '/' + str(total))
    if len(items) < 50:
        break
    time.sleep(0.1)

print('Total fetched: ' + str(len(all_items)))

# Print all field names from first item so we can see structure
if all_items:
    print('Fields available: ' + str(list(all_items[0].keys())))

found = []
for item in all_items:
    s = item.get('socialMediaLinks')
    if s:
        found.append({'order': item.get('shopifyOrderNumber') or item.get('orderNumber'), 'name': str(item.get('clientFirstName','')) + ' ' + str(item.get('clientLastName','')), 'socials': s})

print('Found ' + str(len(found)) + ' with social links')
for f in found:
    print('#' + str(f['order']) + ' ' + f['name'] + ': ' + str(f['socials']))

json.dump(found, open('socials_output.json','w'), indent=2)
print('Saved socials_output.json')
