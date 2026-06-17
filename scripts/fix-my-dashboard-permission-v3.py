path = "src/app/api/my-dashboard/route.ts"
with open(path) as f:
    lines = f.readlines()

def find_line(lines, stripped_target):
    return [i for i, l in enumerate(lines) if l.strip() == stripped_target]

def indent_of(line):
    return line[:len(line) - len(line.lstrip())]

# Edit 1: expand select() to include fields needed for the isOwnData check
t1 = '.select("role")'
m1 = find_line(lines, t1)
print(f"target1 matches: {m1}")
assert len(m1) == 1, f"expected 1 match for target1, got {len(m1)}"
i1 = m1[0]
lines[i1] = f'{indent_of(lines[i1])}.select("role, team_member_name, location, department")\n'

# Edit 2: replace "const allowed = ..." with isPrivileged + isOwnData
t2 = 'const allowed = ["admin", "general_manager", "manager"].includes(caller?.role ?? "");'
m2 = find_line(lines, t2)
print(f"target2 matches: {m2}")
assert len(m2) == 1, f"expected 1 match for target2, got {len(m2)}"
i2 = m2[0]
ind2 = indent_of(lines[i2])
lines[i2] = (
    f'{ind2}const isPrivileged = ["admin", "general_manager", "manager"].includes(caller?.role ?? "");\n'
    f'{ind2}const isOwnData =\n'
    f'{ind2}  caller?.team_member_name === memberNameParam &&\n'
    f'{ind2}  caller?.location === locationParam &&\n'
    f'{ind2}  caller?.department === departmentParam;\n'
)

# Edit 3: replace the "if (!allowed) return ..." line
t3 = 'if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });'
m3 = find_line(lines, t3)
print(f"target3 matches: {m3}")
assert len(m3) == 1, f"expected 1 match for target3, got {len(m3)}"
i3 = m3[0]
ind3 = indent_of(lines[i3])
lines[i3] = f'{ind3}if (!isPrivileged && !isOwnData) return NextResponse.json({{ error: "Forbidden" }}, {{ status: 403 }});\n'

with open(path, "w") as f:
    f.writelines(lines)
print("Patched successfully.")
