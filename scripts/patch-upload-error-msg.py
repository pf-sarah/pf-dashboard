path = '/Users/sarahferrell/Documents/pf-dashboard/src/app/api/admin/hours-upload/route.ts'
c = open(path).read()

# Include row context when the upsert fails
old1 = "      if (error) throw error;\n      upserted++;"
new1 = """      if (error) throw new Error(`Upsert failed for ${rec.member_name} / ${rec.department} / ${rec.week_of}: ${error.message} (${error.code ?? ''} ${error.details ?? ''})`);
      upserted++;"""
assert c.count(old1) == 1, 'old1 not found'
c = c.replace(old1, new1)

# Serialize unknown errors properly
old2 = "    return NextResponse.json({ error: String(e) }, { status: 500 });"
new2 = "    const msg = e instanceof Error ? e.message : JSON.stringify(e);\n    return NextResponse.json({ error: msg }, { status: 500 });"
assert c.count(old2) == 1, 'old2 not found'
c = c.replace(old2, new2)

open(path, 'w').write(c)
print('patched OK')
