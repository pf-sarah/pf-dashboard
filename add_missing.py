import json, csv

# Orders found in the recent_socials.py run that didn't save
new_records = [
    {'order': '48542', 'client': 'Jamie', 'email': '', 'social': 'Jamielynn131428'},
    {'order': '48583', 'client': 'Hannah', 'email': '', 'social': 'hannahlynch7'},
    {'order': '48584', 'client': 'Laurel', 'email': '', 'social': '@laurelfive'},
    {'order': '48585', 'client': 'Madison', 'email': '', 'social': 'Madisonmarquess'},
    {'order': '48624', 'client': 'Lyndsay', 'email': '', 'social': '@lynpossible'},
    {'order': '48663', 'client': 'Juliana', 'email': '', 'social': 'Julianaawilson'},
    {'order': '48664', 'client': 'Madeline', 'email': '', 'social': '@mpzhall'},
    {'order': '48665', 'client': 'Ryan', 'email': '', 'social': '@laurenannehickey'},
    {'order': '48696', 'client': 'Andrew', 'email': '', 'social': '@abbykat02'},
    {'order': '48773', 'client': 'Maggie', 'email': '', 'social': '@maggieatcheson @wildflowerdsm'},
    {'order': '48780', 'client': 'Liz', 'email': '', 'social': 'Liz.kratochvil'},
    {'order': '48809', 'client': 'Stephanie', 'email': '', 'social': '@stephanie3adamss @distinctiveflorals'},
    {'order': '48846', 'client': 'Dilara', 'email': '', 'social': '@dhatipo @beeinspiredevents'},
    {'order': '48868', 'client': 'Hannah', 'email': '', 'social': 'Hannahczaj'},
    {'order': '48904', 'client': 'Allie', 'email': '', 'social': '@allie.skeek @claycreativephoto @blomsterhus.907'},
    {'order': '48964', 'client': 'Kimberly', 'email': '', 'social': 'a.kennnedy'},
    {'order': '49028', 'client': 'Brianne', 'email': '', 'social': 'Instagram - @bri.olb11'},
    {'order': '49035', 'client': 'Bella', 'email': '', 'social': 'bellasabassett'},
    {'order': '49063', 'client': 'Alexandra', 'email': '', 'social': '@aliwesttt'},
    {'order': '49096', 'client': 'Michael', 'email': '', 'social': 'Instagram: @Banjofood, @lianamo53, @expressionsfloraldesigns, @ashleygermainephoto'},
    {'order': '49109', 'client': 'Amanda', 'email': '', 'social': '@amandabruton_'},
    {'order': '49112', 'client': 'Grace', 'email': '', 'social': '@graceteepe'},
    {'order': '49126', 'client': 'Desiree', 'email': '', 'social': '@des.glynn'},
    {'order': '49146', 'client': 'Heather', 'email': '', 'social': 'Hbroujos'},
    {'order': '49187', 'client': 'Mindy', 'email': '', 'social': 'IG: @melyndagerrard'},
    {'order': '49200', 'client': 'Casey', 'email': '', 'social': '@caseyrutkey @vowandverve'},
    {'order': '49376', 'client': '', 'email': '', 'social': '@sarah__klotz; @blossomsbyjilliann; @reverieeventsandweddings'},
    {'order': '49387', 'client': 'Teresa', 'email': '', 'social': 'baker.teresa.rd'},
    {'order': '49407', 'client': 'rebecca', 'email': '', 'social': 'beckyyevs'},
    {'order': '49412', 'client': 'Claudia', 'email': '', 'social': '@claudiaeastland'},
    {'order': '49476', 'client': 'Leah', 'email': '', 'social': 'Leah.weber98'},
    {'order': '49527', 'client': 'EILEEN', 'email': '', 'social': 'Eileenmcarey'},
    {'order': '49555', 'client': 'Alysa', 'email': '', 'social': 'Alysa_rivas, alysa.lisbeth, growersdirectflowersla'},
    {'order': '49577', 'client': 'Chelsea', 'email': '', 'social': '@chelseaanoelle @expressionsfloraldesigns @kolesiaki'},
    {'order': '49670', 'client': 'Christopher', 'email': '', 'social': 'Bride: @alan.na     Florist: @nectarandvessel'},
    {'order': '49701', 'client': 'Michelle', 'email': '', 'social': '@me.viorato @ohmaifloraldesign'},
    {'order': '49837', 'client': 'sarah', 'email': '', 'social': '_sarahhannigan'},
]

data = json.load(open('full_socials_output.json'))
existing_orders = set(r['order'] for r in data)

added = 0
for r in new_records:
    if r['order'] not in existing_orders:
        data.append(r)
        existing_orders.add(r['order'])
        added += 1

json.dump(data, open('full_socials_output.json', 'w'), indent=2)

with open('vendors.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Order', 'Client', 'Email', 'Social/Vendor Info'])
    for r in sorted(data, key=lambda x: int(x['order']) if x.get('order','').isdigit() else 0):
        w.writerow([r.get('order',''), r.get('client',''), r.get('email',''), r.get('social','')])

print('Added ' + str(added) + ' new records')
print('Total: ' + str(len(data)))
print('vendors.csv updated')
