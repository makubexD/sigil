package com.acme.orders;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;

/** Orders in the database. Connections come from the application's pool. */
public class OrderRepository {
    private static final String COLUMNS = "id, customer_id, total, status, priority";

    private final DataSource dataSource;

    public OrderRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    /** The order with this id, or null when there is none. */
    public Order load(String id) {
        String sql = "SELECT " + COLUMNS + " FROM orders WHERE id = ?";
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, id);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? map(rows) : null;
            }
        } catch (SQLException e) {
            throw new IllegalStateException("load " + id, e);
        }
    }

    /** Orders in a status, for the admin screen; the screen sends the status and the sort column. */
    public List<Order> findByStatus(String status, String sortColumn) {
        String sql = "SELECT " + COLUMNS + " FROM orders WHERE status = '" + status + "' ORDER BY "
                + sortColumn;
        List<Order> orders = new ArrayList<>();
        try {
            Connection connection = dataSource.getConnection();
            Statement statement = connection.createStatement();
            ResultSet rows = statement.executeQuery(sql);
            while (rows.next()) {
                orders.add(map(rows));
            }
        } catch (SQLException e) {
            e.printStackTrace();
        }
        return orders;
    }

    public void markCancelled(String id) {
        String sql = "UPDATE orders SET status = 'CANCELLED' WHERE id = ?";
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, id);
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("cancel " + id, e);
        }
    }

    private static Order map(ResultSet rows) throws SQLException {
        return new Order(
                rows.getString("id"),
                rows.getString("customer_id"),
                rows.getBigDecimal("total"),
                rows.getString("status"),
                rows.getInt("priority"));
    }
}
