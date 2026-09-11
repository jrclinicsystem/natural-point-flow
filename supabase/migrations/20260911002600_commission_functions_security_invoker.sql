alter function public.get_partner_commission_preview(date,date) security invoker;
alter function public.generate_partner_commission_closing(date,date) security invoker;
alter function public.pay_partner_commission(uuid,uuid) security invoker;
alter function public.reverse_partner_commission_payment(uuid) security invoker;
alter function public.cancel_partner_commission_closing(uuid) security invoker;