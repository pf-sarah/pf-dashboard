path = '/Users/sarahferrell/Documents/pf-dashboard/src/app/api/admin/hours-upload/route.ts'
c = open(path).read()

old1 = "  if (l.includes('checks') || l.includes('unboxing')) return 'checks_unboxing';"
new1 = old1 + "\n  if (l.includes('resin'))         return 'Resin';"
assert c.count(old1) == 1, 'old1 not found'
c = c.replace(old1, new1)

old2 = "if (!['design', 'preservation', 'fulfillment', 'checks_unboxing'].includes(dept)) continue;"
new2 = "if (!['design', 'preservation', 'fulfillment', 'checks_unboxing', 'Resin'].includes(dept)) continue;"
assert c.count(old2) == 1, 'old2 not found'
c = c.replace(old2, new2)

open(path, 'w').write(c)
print('patched OK')
