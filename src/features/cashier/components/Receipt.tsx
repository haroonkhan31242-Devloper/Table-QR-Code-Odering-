import React from 'react';
import { createPortal } from 'react-dom';
import type { Payment, Restaurant } from '@/src/types/domain';
import { formatDateTime, formatMoney } from '@/src/utils/format';

export function ReceiptView({ payment, restaurant, reprint }: { payment: Payment; restaurant: Restaurant; reprint?: number }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-2xl border border-line bg-white p-6 font-mono text-[12.5px] leading-relaxed text-[#111] shadow-sm">
      <div className="text-center">
        <p className="font-display text-[18px] font-bold tracking-tight">{restaurant.name}</p>
        <p className="text-[11.5px] text-[#555]">{restaurant.address}</p>
        {restaurant.phone && <p className="text-[11.5px] text-[#555]">{restaurant.phone}</p>}
      </div>
      <div className="my-4 border-t border-dashed border-[#bbb]" />
      <div className="flex justify-between"><span>Receipt</span><span>{payment.receiptNumber}</span></div>
      <div className="flex justify-between"><span>Date</span><span>{formatDateTime(payment.paidAt)}</span></div>
      <div className="flex justify-between"><span>Table</span><span>{payment.tableLabel}</span></div>
      <div className="flex justify-between"><span>Bill</span><span>{payment.billType === 'combined_table' ? 'Combined table' : 'Individual'}</span></div>
      <div className="flex justify-between gap-4"><span>Orders</span><span className="text-right">{payment.orderNumbers.join(', ')}</span></div>
      <div className="flex justify-between"><span>Cashier</span><span>{payment.cashier.name}</span></div>
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
      <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(payment.subtotal)}</span></div>
      {payment.serviceCharge > 0 && <div className="flex justify-between"><span>Service charge</span><span>{formatMoney(payment.serviceCharge)}</span></div>}
      <div className="mt-1 flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>{formatMoney(payment.totalDue)}</span></div>
      <div className="mt-2 flex justify-between"><span>Cash received</span><span>{formatMoney(payment.amountReceived)}</span></div>
      <div className="flex justify-between font-bold"><span>Change</span><span>{formatMoney(payment.changeDue)}</span></div>
      <div className="my-4 border-t border-dashed border-[#bbb]" />
      <p className="text-center">Paid · Cash at counter</p>
      {reprint ? <p className="mt-1 text-center text-[11px] text-[#777]">REPRINT #{reprint}</p> : null}
      <p className="mt-3 text-center text-[11.5px] text-[#555]">{restaurant.settings.receiptFooter}</p>
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
