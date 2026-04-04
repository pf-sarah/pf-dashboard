'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface OrderEntry { orderNum: string; variantTitle: string|null; staffName: string|null; enteredAt: string|null; }
interface LocationData {
  Utah: Record<string,number>; Georgia: Record<string,number>;
  UtahOrders: Record<string,OrderEntry[]>; GeorgiaOrders: Record<string,OrderEntry[]>;
  unresolved: number; cachedCount: number;
}
const STATUS_LABELS: Record<string,string> = {
  bouquetReceived:'Bouquet Received',checkedOn:'Checked On',progress:'In Progress',
  almostReadyToFrame:'Almost Ready to Frame',readyToFrame:'Ready to Frame',
  frameCompleted:'No Response',disapproved:'Disapproved',approved:'Approved',
  noResponse:'No Response',readyToSeal:'Ready to Seal',glued:'Glued',
  readyToPackage:'Ready to Package',readyToFulfill:'Ready to Fulfill',
  preparingToBeShipped:'Preparing to Ship',
};
const DEPT_STATUSES: Record<string,string[]> = {
  Preservation:['bouquetReceived','checkedOn','progress','almostReadyToFrame'],
  Design:['readyToFrame','frameCompleted','disapproved','approved'],
  Fulfillment:['readyToSeal','glued','readyToPackage','readyToFulfill','preparingToBeShipped'],
};
const DEPT_COLORS: Record<string,string> = {Preservation:'border-green-200 bg-green-50',Design:'border-indigo-200 bg-indigo-50/50',Fulfillment:'border-amber-200 bg-amber-50/50'};
const DEPT_TEXT: Record<string,string> = {Preservation:'text-green-700',Design:'text-indigo-700',Fulfillment:'text-amber-700'};

function fmtDate(iso: string|null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch { return iso; }
}

function OrderPanel({status,orders,onClose}:{status:string;orders:OrderEntry[];onClose:()=>void}) {
  const [search,setSearch]=useState('');
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase(); if(!q) return orders;
    return orders.filter(o=>o.orderNum.includes(q)||(o.variantTitle??'').toLowerCase().includes(q)||(o.staffName??'').toLowerCase().includes(q));
  },[orders,search]);
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-semibold text-slate-600">{STATUS_LABELS[status]??status} — {orders.length} orders</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
      </div>
      <div className="px-3 py-2 border-b border-slate-100">
        <input type="text" placeholder="Search order #, frame, staff…" value={search} onChange={e=>setSearch(e.target.value)} autoFocus
          className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-700 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
        {search&&<p className="text-xs text-slate-400 mt-1">{filtered.length} of {orders.length}</p>}
      </div>
      <div className="overflow-auto max-h-72">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium text-slate-500">Order #</th>
              <th className="px-3 py-1.5 text-left font-medium text-slate-500">Frame</th>
              <th className="px-3 py-1.5 text-left font-medium text-slate-500">Staff</th>
              <th className="px-3 py-1.5 text-left font-medium text-slate-500">In status since</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length===0?(
              <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400 italic">No results</td></tr>
            ):filtered.map((o,i)=>(
              <tr key={`${o.orderNum}|${o.variantTitle}|${i}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-3 py-1.5 font-mono text-indigo-700 whitespace-nowrap">#{o.orderNum}</td>
                <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{o.variantTitle||'—'}</td>
                <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{o.staffName||<span className="text-slate-300 italic">unassigned</span>}</td>
                <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{fmtDate(o.enteredAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LocationColumn({name,counts,orders}:{name:string;counts:Record<string,number>;orders:Record<string,OrderEntry[]>}) {
  const [expandedStatus,setExpandedStatus]=useState<string|null>(null);
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{name}</h3>
        <span className="text-xs text-slate-400">{total.toLocaleString()} total</span>
      </div>
      {Object.entries(DEPT_STATUSES).map(([dept,statuses])=>{
        const deptTotal=statuses.reduce((s,st)=>s+(counts[st]??0),0);
        return (
          <Card key={dept} className={`border ${DEPT_COLORS[dept]}`}>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className={`text-xs font-semibold uppercase tracking-wide ${DEPT_TEXT[dept]}`}>{dept} — {deptTotal.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1">
              {statuses.map(st=>{
                const count=counts[st]??0;
                const isExpanded=expandedStatus===st;
                const statusOrders=orders[st]??[];
                return (
                  <div key={st}>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600">{STATUS_LABELS[st]??st}</span>
                      {count>0?(
                        <button onClick={()=>setExpandedStatus(prev=>prev===st?null:st)}
                          className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors cursor-pointer ${isExpanded?'bg-indigo-200 text-indigo-800':'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
                          {count.toLocaleString()}
                        </button>
                      ):(
                        <span className="text-slate-300 font-semibold text-xs">0</span>
                      )}
                    </div>
                    {isExpanded&&<OrderPanel status={st} orders={statusOrders} onClose={()=>setExpandedStatus(null)} />}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function SortedLocationSection() {
  const [data,setData]=useState<LocationData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [resolving,setResolving]=useState(false);
  const [resolveMsg,setResolveMsg]=useState('');
  const [globalSearch,setGlobalSearch]=useState('');
  const [unmatched,setUnmatched]=useState<{name:string;count:number}[]>([]);
  const [showUnmatched,setShowUnmatched]=useState(false);
  const [unresolvedOrders,setUnresolvedOrders]=useState<{orderNum:string;variantTitle:string;status:string;orderDate:string}[]>([]);
  const [showUnresolvedOrders,setShowUnresolvedOrders]=useState(false);

  async function load(){
    setLoading(true);setError('');
    try{
      const res=await fetch('/api/location-counts');
      const json=await res.json() as LocationData&{error?:string};
      if(json.error){setError(json.error);return;}
      setData(json);
    }catch(e){setError(String(e));}finally{setLoading(false);}
  }

  async function resolveNow(){
    setResolving(true);setResolveMsg('');
    try{
      const res=await fetch('/api/admin/resolve-locations',{method:'POST'});
      const json=await res.json() as {resolved?:number;total?:number;message?:string;error?:string;unmatched?:{name:string;count:number}[];unresolvedOrders?:{orderNum:string;variantTitle:string;status:string;orderDate:string}[]};
      if(json.error){setResolveMsg(`Failed: ${json.error}`);}
      else{
        setResolveMsg(json.message??`Resolved ${json.resolved??0} of ${json.total??0}`);
        if(json.unmatched)setUnmatched(json.unmatched);
        if(json.unresolvedOrders)setUnresolvedOrders(json.unresolvedOrders);
        await load();
      }
    }catch{setResolveMsg('Failed to resolve');}
    setResolving(false);
  }

  useEffect(()=>{void load();},[]);

  const globalResults=useMemo(()=>{
    const q=globalSearch.trim().toLowerCase();
    if(!q||!data) return [];
    const results: {orderNum:string;variantTitle:string|null;status:string;location:string;staffName:string|null;enteredAt:string|null}[]=[];
    (['Utah','Georgia'] as const).forEach(loc=>{
      const ordersMap=loc==='Utah'?data.UtahOrders:data.GeorgiaOrders;
      Object.entries(ordersMap??{}).forEach(([status,orders])=>{
        (orders??[]).forEach(o=>{
          if(o.orderNum.toLowerCase().includes(q)||(o.variantTitle??'').toLowerCase().includes(q)){
            results.push({...o,status,location:loc});
          }
        });
      });
    });
    return results;
  },[globalSearch,data]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sorted by Location</h2>
          <span className="text-xs text-slate-400">PF counts + resolved unassigned orders</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {resolveMsg&&<span className="text-xs text-slate-400">{resolveMsg}</span>}
          {data&&data.unresolved>0&&(
            <button onClick={()=>setShowUnmatched(v=>!v)} className="text-xs text-amber-600 hover:text-amber-800 transition-colors">
              {data.unresolved.toLocaleString()} still unresolved {showUnmatched?'▲':'▼'}
            </button>
          )}
          <button onClick={()=>void resolveNow()} disabled={resolving}
            className="px-3 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors">
            {resolving?'Resolving…':'Resolve Unassigned'}
          </button>
          <button onClick={()=>void load()} disabled={loading}
            className="px-3 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors">
            {loading?'Loading…':'Refresh'}
          </button>
        </div>
      </div>
      {error&&<p className="text-xs text-red-500">{error}</p>}

      <div className="relative">
        <input type="text" placeholder="Search any order number across all locations and statuses…"
          value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-700 bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        {globalSearch&&<button onClick={()=>setGlobalSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg">×</button>}
      </div>

      {globalSearch.trim()&&(
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
            <span className="text-xs font-semibold text-slate-600">{globalResults.length} result{globalResults.length!==1?'s':''} for &quot;{globalSearch}&quot;</span>
          </div>
          {globalResults.length===0?(
            <p className="px-4 py-4 text-xs text-slate-400 italic">No orders found.</p>
          ):(
            <div className="overflow-auto max-h-80">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Order #</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Frame</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Location</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">Staff</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-500">In status since</th>
                  </tr>
                </thead>
                <tbody>
                  {globalResults.map((r,i)=>(
                    <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-indigo-700 whitespace-nowrap">#{r.orderNum}</td>
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{r.variantTitle||'—'}</td>
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.location}</td>
                      <td className="px-4 py-2 whitespace-nowrap"><span className="bg-slate-100 text-slate-700 rounded px-1.5 py-0.5">{STATUS_LABELS[r.status]??r.status}</span></td>
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.staffName||<span className="text-slate-300 italic">unassigned</span>}</td>
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{fmtDate(r.enteredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showUnmatched&&unmatched.length>0&&(
        <div className="rounded border border-amber-200 bg-amber-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700 mb-2">Unmatched uploaders — add to staff_locations in Supabase:</p>
          {unmatched.map(u=>(<div key={u.name} className="flex justify-between text-xs"><span className="text-slate-700">{u.name}</span><span className="text-slate-400">{u.count} order{u.count!==1?'s':''}</span></div>))}
        </div>
      )}
      {unresolvedOrders.length>0&&(
        <div>
          <button onClick={()=>setShowUnresolvedOrders(v=>!v)} className="text-xs text-slate-500 hover:text-slate-700 transition-colors mb-2">
            {unresolvedOrders.length} unresolved order details {showUnresolvedOrders?'▲':'▼'}
          </button>
          {showUnresolvedOrders&&(
            <div className="rounded border border-slate-200 bg-slate-50 overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 sticky top-0"><tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Order #</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Variant</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Order Date</th>
                </tr></thead>
                <tbody>{unresolvedOrders.map((o,i)=>(<tr key={i} className="border-t border-slate-200"><td className="px-3 py-1.5 text-slate-700">{o.orderNum}</td><td className="px-3 py-1.5 text-slate-500">{o.variantTitle}</td><td className="px-3 py-1.5 text-slate-500">{o.status}</td><td className="px-3 py-1.5 text-slate-400">{o.orderDate}</td></tr>))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loading&&<p className="text-sm text-slate-400 text-center py-6">Loading location data…</p>}
      {!loading&&data&&(
        <>
          {data.cachedCount>0&&<p className="text-xs text-slate-400">{data.cachedCount.toLocaleString()} unassigned orders resolved from bouquet upload history</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <LocationColumn name="Utah" counts={data.Utah} orders={data.UtahOrders??{}} />
            <LocationColumn name="Georgia" counts={data.Georgia} orders={data.GeorgiaOrders??{}} />
          </div>
        </>
      )}
    </section>
  );
}
