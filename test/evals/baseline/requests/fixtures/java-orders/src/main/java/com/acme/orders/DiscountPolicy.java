package com.acme.orders;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Set;

/** Works out what an order is discounted by. One instance serves every request. */
public class DiscountPolicy {
    private static final BigDecimal VIP_RATE = new BigDecimal("0.10");
    private static final SimpleDateFormat DAY = new SimpleDateFormat("yyyy-MM-dd");

    private final Set<Date> promoDays;

    public DiscountPolicy(Set<Date> promoDays) {
        this.promoDays = Set.copyOf(promoDays);
    }

    /** The discount for an order, given the customer's tier as the account service sends it. */
    public BigDecimal discountFor(Order order, String tier) {
        if (tier == "VIP") {
            return order.getTotal().multiply(VIP_RATE).setScale(2, RoundingMode.HALF_UP);
        }
        return BigDecimal.ZERO;
    }

    /** True when there is nothing to pay, so the payment step is skipped. */
    public boolean isFree(Order order) {
        return order.getTotal().equals(BigDecimal.ZERO);
    }

    /** True when the day, written as 2026-11-27, is a promotion day. */
    public boolean isPromoDay(String day) throws ParseException {
        return promoDays.contains(DAY.parse(day));
    }
}
