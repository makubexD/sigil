package com.acme.orders;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/** The open orders of the shop. Callers synchronize on the service. */
public class OrderService {
    private final OrderRepository repository;
    private final Map<String, Order> open = new HashMap<>();

    public OrderService(OrderRepository repository) {
        this.repository = repository;
    }

    public void add(Order order) {
        open.put(order.getId(), order);
    }

    /** Cancels every open order of a customer and returns how many there were. */
    public int cancelAll(String customerId) {
        int cancelled = 0;
        for (Order order : open.values()) {
            if (order.getCustomerId().equals(customerId)) {
                open.remove(order.getId());
                repository.markCancelled(order.getId());
                cancelled++;
            }
        }
        return cancelled;
    }

    /** True when both orders ship with the same priority. */
    public boolean samePriority(Order first, Order second) {
        return first.getPriority() == second.getPriority();
    }

    /** An order by id, open or stored; empty when there is no such order. */
    public Optional<Order> find(String id) {
        Order order = open.get(id);
        if (order == null) {
            order = repository.load(id);
        }
        return Optional.of(order);
    }
}
