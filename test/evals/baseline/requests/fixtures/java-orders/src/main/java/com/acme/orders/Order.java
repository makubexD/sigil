package com.acme.orders;

import java.math.BigDecimal;

/** One order. Immutable. */
public final class Order {
    private final String id;
    private final String customerId;
    private final BigDecimal total;
    private final String status;
    private final Integer priority;

    public Order(String id, String customerId, BigDecimal total, String status, Integer priority) {
        this.id = id;
        this.customerId = customerId;
        this.total = total;
        this.status = status;
        this.priority = priority;
    }

    public String getId() {
        return id;
    }

    public String getCustomerId() {
        return customerId;
    }

    /** The order total, as stored: two decimal places. */
    public BigDecimal getTotal() {
        return total;
    }

    public String getStatus() {
        return status;
    }

    /** 1 to 1000; a higher number ships first. */
    public Integer getPriority() {
        return priority;
    }
}
