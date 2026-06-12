path = '/Users/sarahferrell/Documents/pf-dashboard/src/app/api/my-dashboard/route.ts'
c = open(path).read()
old = "  return NextResponse.json({\n    memberName,"
new = "  return NextResponse.json({\n    routeVersion: 'v3-resin-shapes',\n    memberName,"
assert c.count(old) == 1, 'not found'
c = open(path, 'w').write(c.replace(old, new))
print('patched OK')
