import React from 'react';

export const HelperReference: React.FC = () => (
  <div style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 10, padding: 10, fontSize: 12, marginBottom: 12 }}>
    <div style={{ fontWeight: 700, marginBottom: 6 }}>Helper reference</div>
    <div>• rank(node): number | undefined — rank of node</div>
    <div>• covers(node): string[] — nodes directly above (children of node)</div>
    <div>• coveredBy(node): string[] — nodes directly below (parents of node)</div>
    <div>• lt(a, b): boolean — a is strictly below b (reachable downward from b)</div>
    <div>• gt(a, b): boolean — a is strictly above b</div>
    <div>• leq(a, b): boolean — a == b or a below b</div>
    <div>• geq(a, b): boolean — a == b or a above b</div>
    <div>• one: string | undefined — top element id (⊤)</div>
    <div>• zero: string | undefined — bottom element id (⊥)</div>
  </div>
);
