path = '/Users/sarahferrell/Documents/pf-dashboard/src/components/dashboard/ResinPage.tsx'
c = open(path).read()

old1 = """  function getActual(weekOf: string, memberId: string): ResinActual | undefined {
    return actuals.find(a => a.weekOf === weekOf && a.memberId === memberId);
  }"""
new1 = """  function getActual(weekOf: string, member: ResinMember): ResinActual | undefined {
    return actuals.find(a => a.weekOf === weekOf &&
      (a.memberId === member.id || a.memberName === member.name || a.memberId === member.name));
  }"""
assert c.count(old1) == 1, 'old1 not found'
c = c.replace(old1, new1)

old2 = "    const existing = getActual(weekOf, member.id);"
new2 = "    const existing = getActual(weekOf, member);"
assert c.count(old2) == 1, 'old2 not found'
c = c.replace(old2, new2)

old3 = "    const next = actuals.filter(a => !(a.weekOf === weekOf && a.memberId === member.id));"
new3 = """    const next = actuals.filter(a => !(a.weekOf === weekOf &&
      (a.memberId === member.id || a.memberName === member.name || a.memberId === member.name)));"""
assert c.count(old3) == 1, 'old3 not found'
c = c.replace(old3, new3)

old4 = "                  const a    = getActual(w, m.id);"
new4 = "                  const a    = getActual(w, m);"
assert c.count(old4) == 1, 'old4 not found'
c = c.replace(old4, new4)

open(path, 'w').write(c)
print('patched OK')
