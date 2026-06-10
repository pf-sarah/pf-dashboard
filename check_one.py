import requests, json

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

res = requests.post(PF_API_URL + '/OrderProducts/Search', headers=headers, json={'searchTerm': '46420', 'pageNumber': 1, 'pageSize': 10})
items = res.json().get('orderProducts') or res.json().get('items') or []
for item in items:
    print('UUID: ' + str(item.get('uuid')) + ' | Order: ' + str(item.get('shopifyOrderNumber')))
    uuid = item.get('uuid')
    d = requests.get(PF_API_URL + '/OrderProducts/Details/' + uuid, headers=headers).json()
    print(json.dumps({k: v for k, v in d.items() if v is not None and v != [] and v != {}}, indent=2))
