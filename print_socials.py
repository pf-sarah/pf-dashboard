import json

data = json.load(open('full_socials_output.json'))
print('Total: ' + str(len(data)))
for f in data:
    order = str(f.get('order') or '')
    client = str(f.get('client') or '')
    email = str(f.get('email') or '')
    social = str(f.get('social') or '')
    print('#' + order + ' | ' + client + ' | ' + email + ' | ' + social)
