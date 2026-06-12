path = '/Users/sarahferrell/Documents/pf-dashboard/src/app/api/actuals/route.ts'
c = open(path).read()

old1 = """          location: 'Resin', department: 'Resin', week_of: weekOf,"""
new1 = """          location: 'Utah', department: 'Resin', week_of: weekOf,"""
assert c.count(old1) == 1, 'old1 not found'
c = c.replace(old1, new1)

old2 = """  if (daysDiff > 31) {
    return NextResponse.json({ error: 'Cannot edit actuals older than 31 days' }, { status: 403 });
  }"""
new2 = """  const editWindowDays = type === 'resin' ? 62 : 31;
  if (daysDiff > editWindowDays) {
    return NextResponse.json({ error: `Cannot edit actuals older than ${editWindowDays} days` }, { status: 403 });
  }"""
assert c.count(old2) == 1, 'old2 not found'
c = c.replace(old2, new2)

open(path, 'w').write(c)
print('patched OK')
