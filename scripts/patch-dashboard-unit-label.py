path = '/Users/sarahferrell/Documents/pf-dashboard/src/components/dashboard/MyDashboardClient.tsx'
c = open(path).read()

old1 = '''                <StatCard
                  label="Frames This Week"
                  value={data?.thisWeek?.scheduledHours && data?.thisWeek?.targetRatio
                    ? String(Math.round(data.thisWeek.scheduledHours / data.thisWeek.targetRatio))
                    : "—"}
                  sub={data?.thisWeek?.targetRatio ? `based on ${data.thisWeek.targetRatio} hrs/frame ratio` : "based on scheduled hours"}
                />'''
new1 = '''                <StatCard
                  label={`${({ design: 'Frames', resin: 'Units' } as Record<string, string>)[data?.homeDepartment ?? data?.department ?? ''] ?? 'Orders'} This Week`}
                  value={data?.thisWeek?.scheduledHours && data?.thisWeek?.targetRatio
                    ? String(Math.round(data.thisWeek.scheduledHours / data.thisWeek.targetRatio))
                    : "—"}
                  sub={data?.thisWeek?.targetRatio ? `based on ${data.thisWeek.targetRatio} hrs/${({ design: 'frame', resin: 'unit' } as Record<string, string>)[data?.homeDepartment ?? data?.department ?? ''] ?? 'order'} ratio` : "based on scheduled hours"}
                />'''
assert c.count(old1) == 1, 'old1 not found'
c = c.replace(old1, new1)

open(path, 'w').write(c)
print('patched OK')
