import React from 'react';
import { createPortal } from 'react-dom';
import type { Payment, Restaurant } from '@/src/types/domain';
import { resolveImage } from '@/src/services/images/imageStorage';
import { formatDateTime, formatMoney } from '@/src/utils/format';

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function ReceiptView({ payment, restaurant, reprint }: { payment: Payment; restaurant: Restaurant; reprint?: number }) {
  const logo = resolveImage(restaurant.logoImage);
  const takeaway = payment.orderType === 'takeaway';
  return (
    <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-line bg-white font-mono text-[12.5px] leading-relaxed text-[#111] shadow-sm">
      <div className="h-1.5" style={{ background: restaurant.accentColor }} aria-hidden />
      <div className="p-6">
        <div className="flex flex-col items-center text-center">
          {logo ? (
            <img src={logo} alt="" className="mb-2 size-12 rounded-full object-cover" />
          ) : (
            <span className="mb-2 flex size-12 items-center justify-center rounded-full text-[15px] font-bold text-white" style={{ background: restaurant.accentColor }} aria-hidden>
              {restaurant.name.replace(/&/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
            </span>
          )}
          <p className="font-display text-[18px] font-bold tracking-tight">{restaurant.name}</p>
          {restaurant.address && <p className="text-[11.5px] text-[#555]">{restaurant.address}</p>}
          {restaurant.phone && <p className="text-[11.5px] text-[#555]">{restaurant.phone}</p>}
        </div>
        <div className="my-4 border-t border-dashed border-[#bbb]" />
        <Row label="Receipt" value={payment.receiptNumber} />
        <Row label={payment.orderNumbers.length > 1 ? 'Orders' : 'Order'} value={payment.orderNumbers.join(', ')} />
        <Row label="Date" value={formatDateTime(payment.paidAt)} />
        <Row label="Type" value={takeaway ? 'Takeaway' : 'Dine-in'} />
        {!takeaway && <Row label="Table" value={payment.tableLabel} />}
        {payment.billType === 'combined_table' && <Row label="Bill" value="Combined table" />}
        <Row label="Cashier" value={payment.cashier.name} />
        <div className="my-4 border-t border-dashed border-[#bbb]" />
        <ul className="flex flex-col gap-1">
          {payment.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0">{l.quantity} × {l.title}</span>
              <span className="shrink-0">{formatMoney(l.lineTotal).replace('PKR ', '')}</span>
            </li>
          ))}
        </ul>
        <div className="my-4 border-t border-dashed border-[#bbb]" />
        <Row label="Subtotal" value={formatMoney(payment.subtotal)} />
        {payment.serviceCharge > 0 && <Row label="Service charge" value={formatMoney(payment.serviceCharge)} />}
        <div className="mt-1 flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>{formatMoney(payment.totalDue)}</span></div>
        <div className="mt-2" />
        <Row label="Payment" value="Cash at counter" />
        <Row label="Cash received" value={formatMoney(payment.amountReceived)} />
        <Row label="Change" value={formatMoney(payment.changeDue)} bold />
        <div className="my-4 border-t border-dashed border-[#bbb]" />
        <p className="text-center text-[13px] font-bold tracking-[0.3em]">PAID</p>
        {reprint ? <p className="mt-1 text-center text-[11px] text-[#777]">REPRINT #{reprint}</p> : null}
        <p className="mt-3 text-center text-[11.5px] text-[#555]">{restaurant.settings.receiptFooter}</p>
      </div>
    </div>
  );
}

export function PrintableReceipt(props: { payment: Payment; restaurant: Restaurant; reprint?: number }) {
  return createPortal(
    <div className="print-area">
      <ReceiptView {...props} />
    </div>,
    document.body
  );
}
