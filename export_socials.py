import json, csv

data = json.load(open('full_socials_output.json'))
with open('vendors.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Order', 'Client', 'Email', 'Social/Vendor Info'])
    for r in data:
        w.writerow([r.get('order',''), r.get('client',''), r.get('email',''), r.get('social','')])
print('Saved vendors.csv - ' + str(len(data)) + ' rows')
