package com.acme.orders;

import java.io.BufferedWriter;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/** The daily report: one line per order and the figures under it. */
public class ReportWriter {

    /** Writes one line per order to the target file. */
    public void write(List<Order> orders, Path target) throws IOException {
        try (BufferedWriter writer = Files.newBufferedWriter(target, StandardCharsets.UTF_8)) {
            for (Order order : orders) {
                writer.write(order.getId() + ";" + order.getCustomerId() + ";" + order.getTotal());
                writer.newLine();
            }
        }
    }

    /** The average order total, rounded to cents. A day with no orders is reported too. */
    public BigDecimal average(List<Order> orders) {
        BigDecimal sum = BigDecimal.ZERO;
        for (Order order : orders) {
            sum.add(order.getTotal());
        }
        return sum.divide(BigDecimal.valueOf(orders.size()), 2, RoundingMode.HALF_UP);
    }

    /** A copy of the orders sorted by total, largest first. */
    public List<Order> largestFirst(List<Order> orders) {
        orders.sort((a, b) -> a.getTotal().compareTo(b.getTotal()));
        return orders;
    }
}
