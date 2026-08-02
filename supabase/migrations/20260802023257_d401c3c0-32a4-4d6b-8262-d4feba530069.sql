-- Gift rule child tables: restrict to parent rule's company
CREATE POLICY "gift_rule_conditions_tenant_scope"
  ON public.gift_rule_conditions AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.gift_rules r
      WHERE r.id = gift_rule_conditions.rule_id
        AND r.company_id = private.current_company_id()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.gift_rules r
      WHERE r.id = gift_rule_conditions.rule_id
        AND r.company_id = private.current_company_id()
    )
  );

CREATE POLICY "gift_rule_gifts_tenant_scope"
  ON public.gift_rule_gifts AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.gift_rules r
      WHERE r.id = gift_rule_gifts.rule_id
        AND r.company_id = private.current_company_id()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.gift_rules r
      WHERE r.id = gift_rule_gifts.rule_id
        AND r.company_id = private.current_company_id()
    )
  );

-- Group buy orders: restrict to parent group buy's company
CREATE POLICY "group_buy_orders_tenant_scope"
  ON public.group_buy_orders AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.group_buys g
      WHERE g.id = group_buy_orders.group_buy_id
        AND g.company_id = private.current_company_id()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.group_buys g
      WHERE g.id = group_buy_orders.group_buy_id
        AND g.company_id = private.current_company_id()
    )
  );