// server.js

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const connection = require('./db'); // db.js with mysql2.createPool().promise()
const pool = require('./db'); // db.js with mysql2.createPool().promise()
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret123';

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves files like login.html

// ✅ Login API
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Missing credentials' });
  }

  try {
    const [rows] = await connection.query('SELECT * FROM users WHERE username = ?', [username]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    const token = jwt.sign({ id: user.id, role: user.userType }, JWT_SECRET, { expiresIn: '2h' });

    res.json({ success: true, token, userType: user.userType });
  } catch (error) {
    console.error('❌ Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// ✅ Get warehouse ID by email – for storing in localStorage
app.get("/api/get-warehouse-id", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Missing email" });

  try {
    const [rows] = await connection.query(
      "SELECT id, name FROM warehouses WHERE email = ?",
      [email]
    );
    if (!rows.length) return res.status(404).json({ error: "Warehouse not found" });

    res.json({ id: rows[0].id, name: rows[0].name }); // ✅ send both
  } catch (err) {
    console.error("❌ Get Warehouse ID Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get distributor ID by email
app.get("/api/get-distributor-id", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Missing email" });

  try {
    const [rows] = await connection.query(
      "SELECT id FROM distributors WHERE email = ?",
      [email]
    );
    if (!rows.length) return res.status(404).json({ error: "Distributor not found" });

    res.json({ id: rows[0].id });
  } catch (err) {
    console.error("❌ Get Distributor ID Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});


// ✅ Product POST routed
app.post('/api/product', async (req, res) => {
  const { pName, sku, ean, unit, qty, mrp, sellingprice } = req.body;

  if (!pName || !sku || !ean || !unit || !qty || !mrp || !sellingprice) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    await connection.query(
      'INSERT INTO products (name, sku, ean, unit, qty, mrp, sellingprice) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [pName, sku, ean, unit, qty, mrp, sellingprice]
    );

    res.json({ success: true, message: '✅ Product added successfully!' });
  } catch (err) {
    console.error('❌ DB Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✅ Get Products API
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await connection.query('SELECT * FROM products');
    res.json({ success: true, products: rows });
  } catch (error) {
    console.error('❌ Fetch Products Error:', error.sqlMessage || error);
    res.status(500).json({ success: false, message: '❌ Error fetching products' });
  }
});

// UPDATE product by ID
app.put("/api/product/:id", async (req, res) => {
  const { id } = req.params;
  const { name, mrp, sellingprice } = req.body;

  if (!name || !mrp || !sellingprice) {
    return res.status(400).json({ success: false, message: "Name and Selling Price are required" });
  }

  try {
    const [result] = await connection.query(
      "UPDATE products SET name = ?, mrp = ?, sellingprice = ? WHERE id = ?",
      [name, mrp, sellingprice, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.json({ success: true, message: "Product updated successfully!" });
  } catch (err) {
    console.error("❌ DB error:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// DELETE product by ID (safe version)
app.delete("/api/product/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // 1️⃣ Check if the product is referenced in any distributor orders
    const [orders] = await connection.query(
      "SELECT COUNT(*) AS count FROM distributor_orders WHERE product_id = ?",
      [id]
    );

    if (orders[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete this product. There are orders linked to it."
      });
    }

    // 2️⃣ Delete the product if no references exist
    const [result] = await connection.query(
      "DELETE FROM products WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.json({ success: true, message: "Product deleted successfully!" });
  } catch (err) {
    console.error("❌ DB error:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// Add Warehouse
app.post("/add-warehouse", async (req, res) => {
  const { wName, wLocation, wEmail, wPass } = req.body;

  // Basic validation
  if (!wName || !wLocation || !wEmail || !wPass) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  let conn;
  try {
    conn = await connection.getConnection(); // ✅ get single connection for transaction

    // Check if email already exists in users
    const [existing] = await conn.query(
      "SELECT id FROM users WHERE username = ?",
      [wEmail]
    );

    if (existing.length > 0) {
      conn.release(); // ✅ release before returning
      return res.status(400).json({
        success: false,
        message: "Email already exists. Please use a different one."
      });
    }

    const hashedPassword = await bcrypt.hash(wPass, 10);

    // ✅ Start transaction
    await conn.beginTransaction();

    // Insert into warehouses
    const [warehouseResult] = await conn.query(
      "INSERT INTO warehouses (name, location, email, password) VALUES (?, ?, ?, ?)",
      [wName, wLocation, wEmail, hashedPassword]
    );

    // Insert into users
    await conn.query(
      "INSERT INTO users (username, password, userType) VALUES (?, ?, ?)",
      [wEmail, hashedPassword, "warehouse"]
    );

    // ✅ Commit transaction
    await conn.commit();

    res.json({
      success: true,
      message: "✅ Warehouse added and login created!",
      warehouseId: warehouseResult.insertId
    });

  } catch (error) {
    console.error("❌ Add Warehouse Error:", error);

    if (conn) {
      try {
        await conn.rollback(); // ✅ rollback if any query failed
      } catch (rollbackError) {
        console.error("Rollback Error:", rollbackError);
      }
    }

    res.status(500).json({ success: false, message: "Error adding warehouse" });
  } finally {
    if (conn) conn.release(); // ✅ always release connection
  }
});

// Get warehouse API
app.get('/api/warehouses', async (req, res) => {
  try {
    // Include id column to send the warehouse ID to frontend
    const [rows] = await connection.query('SELECT id, name, location, email FROM warehouses');
    res.json({ success: true, warehouses: rows });
  } catch (error) {
    console.error('❌ Fetch Warehouses Error:', error);
    res.status(500).json({ success: false, message: 'Error fetching warehouses' });
  }
});

// ✅ POST: Add Distributor with login
app.post("/api/add-distributor", async (req, res) => {
  const { name, email, password, city, warehouse } = req.body;

  if (!name || !email || !password || !city || !warehouse) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into distributors table
    await connection.query(
      `INSERT INTO distributors (name, email, password, city, warehouse) VALUES (?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, city, warehouse]
    );

    // Also insert into users table for login
    await connection.query(
      'INSERT INTO users (username, password, userType) VALUES (?, ?, ?)',
      [email, hashedPassword, 'distributor']
    );

    res.status(200).json({ success: true, message: "Distributor added successfully" });
  } catch (err) {
    console.error("❌ Add Distributor Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// UPDATE warehouse by ID
app.put('/api/warehouse/:id', async (req, res) => {
  const { id } = req.params;
  const { name, location, email } = req.body;

  if (!name || !location || !email) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const [result] = await connection.query(
      'UPDATE warehouses SET name = ?, location = ?, email = ? WHERE id = ?',
      [name, location, email, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Warehouse not found' });
    }

    res.json({ success: true, message: 'Warehouse updated successfully!' });
  } catch (err) {
    console.error('❌ DB error:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// DELETE warehouse by ID
app.delete('/api/warehouse/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await connection.query('DELETE FROM warehouses WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.json({ success: false, message: 'Warehouse not found' });
    }

    res.json({ success: true, message: 'Warehouse deleted successfully!' });
  } catch (err) {
    console.error('❌ DB error:', err);
    res.json({ success: false, message: 'Database error' });
  }
});

// ✅ GET Distributors API (Filtered by Warehouse)
app.get("/api/distributors", async (req, res) => {
  const { warehouse } = req.query;

  try {
    let query = "SELECT id, name, city, email, warehouse FROM distributors";
    let params = [];

    if (warehouse) {
      query += " WHERE warehouse = ?";
      params.push(warehouse);
    }

    const [rows] = await connection.query(query, params);
    res.json({ success: true, distributors: rows });
  } catch (err) {
    console.error("❌ Fetch Distributors Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// UPDATE distributor by ID
app.put('/api/distributor/:id', async (req, res) => {
  const { id } = req.params;
  const { name, city, email, warehouse } = req.body;

  if (!name || !city || !email || !warehouse) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const [result] = await connection.query(
      'UPDATE distributors SET name = ?, city = ?, email = ?, warehouse = ? WHERE id = ?',
      [name, city, email, warehouse, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Distributor not found' });
    }

    // Also update the users table if email changed
    await connection.query(
      'UPDATE users SET username = ? WHERE username = ? AND userType = "distributor"',
      [email, req.body.oldEmail || email] // you can pass oldEmail from frontend if needed
    );

    res.json({ success: true, message: 'Distributor updated successfully!' });
  } catch (err) {
    console.error('❌ DB error:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// DELETE distributor by ID
app.delete('/api/distributor/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Get distributor email before deleting
    const [rows] = await connection.query('SELECT email FROM distributors WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Distributor not found' });
    }
    const email = rows[0].email;

    // Delete from distributors table
    const [result] = await connection.query('DELETE FROM distributors WHERE id = ?', [id]);

    // Delete from users table
    await connection.query('DELETE FROM users WHERE username = ? AND userType = "distributor"', [email]);

    res.json({ success: true, message: 'Distributor deleted successfully!' });
  } catch (err) {
    console.error('❌ DB error:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// ✅ Order Status Update (Admin)
app.put('/orders/:id', async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  try {
    // Step 1: Get existing order info (for distributor/product/qty)
    const [orders] = await connection.query(
      'SELECT warehouse_id, distributor_name, product_name, quantity FROM order_status WHERE order_id = ?',
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: '❌ Order not found' });
    }

    const { warehouse_id, distributor_name, product_name, quantity } = orders[0];

    // Step 2: Update status in main table
    await connection.query(
      'UPDATE order_status SET status = ? WHERE order_id = ?',
      [status, orderId]
    );

    // Step 3: Insert new row into history table
    await connection.query(
      'INSERT INTO order_status_history (order_id, warehouse_id, distributor_name, product_name, quantity, status) VALUES (?, ?, ?, ?, ?, ?)',
      [orderId, warehouse_id, distributor_name, product_name, quantity, status]
    );

    // ✅ Step 4: If Delivered, update distributor_stock
    if (status === 'Delivered') {
      const [[dist]] = await connection.query(
        'SELECT id FROM distributors WHERE email = ?',
        [distributor_name]
      );
      const [[prod]] = await connection.query(
        'SELECT id FROM products WHERE name = ?',
        [product_name]
      );

      if (dist && prod) {
        const distributorId = dist.id;
        const productId = prod.id;

        await connection.query(`
          INSERT INTO distributor_stock (distributor_id, product_id, qty)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE qty = qty + ?
        `, [distributorId, productId, quantity, quantity]);
      }
    }

    // ✅ Step 5: Log it in activity_logs
    const [[wh]] = await connection.query('SELECT name FROM warehouses WHERE id = ?', [warehouse_id]);
const source = `${wh.name} (${distributor_name})`;
await connection.query(
  'INSERT INTO activity_logs (source, description) VALUES (?, ?)',
  [source, `📦 Order #${orderId} updated to "${status}" for ${product_name}`]
);

    res.json({ message: "✅ Order status updated, history recorded, and stock updated if delivered" });

  } catch (error) {
    console.error('❌ Order Update Error:', error.message);
    res.status(500).json({ error: 'Server error while updating order status' });
  }
});

// Admin Activity Logs - GET
app.get('/api/admin/activity-logs', async (req, res) => {
  try {
    const [rows] = await connection.query(`
      SELECT id, source, description, timestamp
      FROM activity_logs
      ORDER BY timestamp DESC
      LIMIT 50
    `);
    res.json({ logs: rows });
  } catch (err) {
    console.error("❌ Admin Activity Logs Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get Order Status History - Admin API
// GET Order Status History - Admin
app.get('/api/admin/order-status', async (req, res) => {
  try {
    const [rows] = await connection.query(`
      SELECT 
             osh.id,
             w.name AS warehouseName,
             d.name AS distributorName,
             p.name AS productName,
             osh.qty,
             osh.status,
             DATE_FORMAT(osh.created_at, '%d-%m-%Y %H:%i:%s') AS created_at
      FROM order_status_history osh
      JOIN warehouses w ON osh.warehouse_id = w.id
      JOIN distributors d ON osh.distributor_id = d.id
      JOIN products p ON osh.product_id = p.id
      ORDER BY osh.created_at DESC
      LIMIT 50
    `);

    res.json({ success: true, orders: rows });
  } catch (err) {
    console.error('❌ Error fetching order status history:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ==================== WAREHOUSE APIs ====================

// ✅ Get current inventory for a warehouse
app.get('/api/warehouse/inventory', async (req, res) => {
  const { warehouseId } = req.query;
  if (!warehouseId) return res.status(400).json({ success: false, error: "Missing warehouseId" });

  try {
    const [rows] = await connection.query(`
      SELECT 
        p.id AS product_id,
        p.name AS product,
        p.sku,
        p.ean,
        p.unit,
        COALESCE(wi.qty, 0) AS qty,
        p.mrp
      FROM products p
      LEFT JOIN warehouse_inventory wi 
        ON p.id = wi.product_id AND wi.warehouse_id = ?
    `, [warehouseId]);

    res.json({ success: true, inventory: rows });
  } catch (err) {
    console.error("❌ Warehouse Inventory Error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ✅ Add stock or update existing stock
app.post("/api/add-stock", async (req, res) => {
  const { warehouseId, sku, qty } = req.body;

  if (!warehouseId || !sku || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: "Invalid input: warehouseId, SKU, and qty must be positive" });
  }

  try {
    // Get product
    const [productRow] = await connection.query(
      "SELECT id, name FROM products WHERE sku = ?",
      [sku]
    );
    if (!productRow.length) return res.status(404).json({ error: "❌ Product not found" });

    const { id: productId, name: productName } = productRow[0];

    // Update or insert stock
    await connection.query(`
      INSERT INTO warehouse_inventory (warehouse_id, product_id, qty)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)
    `, [warehouseId, productId, qty]);

    // Log activity
    const [[warehouse]] = await connection.query('SELECT name FROM warehouses WHERE id = ?', [warehouseId]);
    const source = `${warehouse.name} (Admin)`;
    await connection.query(
      'INSERT INTO activity_logs (source, description) VALUES (?, ?)',
      [source, `➕ Added ${qty} stock for ${productName}`]
    );

    res.json({ success: true, message: "✅ Stock added successfully" });
  } catch (err) {
    console.error("❌ Error adding stock:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------- INCOMING ORDERS (WAREHOUSE) ----------------------
// GET /api/warehouse/orders?warehouseId=123[&status=Pending|Shipped|Delivered]
// GET orders for a warehouse
app.get("/api/warehouse/incoming_orders", async (req, res) => {
  try {
    const { warehouse, status } = req.query;
    if (!warehouse) {
      return res.status(400).json({ error: "Missing warehouse" });
    }

    const params = [warehouse];
    let statusWhere = "";
    if (status && ["Pending", "Shipped", "Delivered"].includes(status)) {
      statusWhere = " AND o.status = ? ";
      params.push(status);
    }

    const [orders] = await connection.query(
      `
      SELECT 
        o.order_id,
        o.id,
        o.warehouse AS warehouseName,   -- string column
        d.name AS distributorName,
        p.name AS productName,
        o.qty AS quantity,
        CONCAT(UPPER(SUBSTRING(o.status,1,1)), LOWER(SUBSTRING(o.status,2))) AS status,
        DATE_FORMAT(CONVERT_TZ(o.created_at, '+00:00', '+05:30'), '%d-%m-%Y %H:%i:%s') AS created_at
      FROM incoming_orders o
      JOIN distributors d ON o.distributor_id = d.id
      JOIN products p     ON o.product_id     = p.id
      WHERE o.warehouse = ?
      ${statusWhere}
      ORDER BY o.created_at DESC
      `,
      params
    );

    // 📊 Status summary
    const [summaryRows] = await connection.query(
      `
      SELECT 
        CONCAT(UPPER(SUBSTRING(status,1,1)), LOWER(SUBSTRING(status,2))) AS status,
        COUNT(*) AS cnt
      FROM incoming_orders
      WHERE warehouse = ?
      GROUP BY status
      `,
      [warehouse]
    );

    const summary = { Pending: 0, Shipped: 0, Delivered: 0 };
    summaryRows.forEach(r => { summary[r.status] = r.cnt; });

    return res.json({ orders, summary });
  } catch (err) {
    console.error("❌ /api/warehouse/orders error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST dispatch order
// ✅ Dispatch order (Pending → Shipped)
app.post("/api/warehouse/dispatch", async (req, res) => {
  try {
    const { orderId } = req.body;
    console.log("Dispatch request orderId:", orderId);

    if (!orderId)
      return res.status(400).json({ success: false, message: "Missing orderId" });

    // Check order exists & Pending
    const [check] = await connection.query(
      "SELECT id, status FROM distributor_orders WHERE order_id = ?",
      [orderId]
    );

    if (check.length === 0)
      return res.status(404).json({ success: false, message: "Order not found" });

    if (check[0].status !== "Pending")
      return res.status(400).json({ success: false, message: "Only Pending orders can be dispatched" });

    // Update status → Shipped (both tables)
    const [resultDist] = await connection.query(
      "UPDATE distributor_orders SET status = 'Shipped' WHERE order_id = ? AND status = 'Pending'",
      [orderId]
    );

    const [resultIncoming] = await connection.query(
      "UPDATE incoming_orders SET status = 'Shipped' WHERE order_id = ? AND status = 'Pending'",
      [orderId]
    );

    if (resultDist.affectedRows === 0)
      return res.status(400).json({ success: false, message: "Order already dispatched or status changed" });

    res.json({ success: true, message: "Order dispatched successfully" });
  } catch (err) {
    console.error("❌ /api/warehouse/dispatch error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// -------------------------------------------------------------------------

// ======= Create new order =======
app.post('/api/warehouse/orders', async (req, res) => {
  const { warehouseId, warehouseName, customerName, items, orderDiscount, totalAmount, finalAmount } = req.body;

  console.log("Incoming Items:", items);

  if (!customerName || !items || items.length === 0) {
    return res.status(400).json({ message: 'Customer name and items required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Insert into orders
    const [orderResult] = await connection.query(
      'INSERT INTO orders (warehouse_name, customer_name, total_amount, discount, final_amount) VALUES (?, ?, ?, ?, ?)',
      [warehouseName, customerName, totalAmount, orderDiscount, finalAmount]
    );

    const orderId = orderResult.insertId;

    // Insert order items
    const itemValues = items.map(i => [orderId, i.product_id, i.product_name, i.qty, i.mrp, i.discount, i.total]);
    if (itemValues.length > 0) {
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, mrp, discount, selling_price) VALUES ?',
        [itemValues]
      );
    }

    // Update inventory safely
    for (const it of items) {
      // ✅ Check stock first
      const [rows] = await connection.query(
        "SELECT qty FROM warehouse_inventory WHERE warehouse_id = ? AND product_id = ?",
        [warehouseId, it.product_id]
      );

      if (!rows.length || rows[0].qty < it.qty) {
        throw new Error(`Not enough stock for product_id ${it.product_id}`);
      }
    
    // ✅ Update inventory for each product
      await connection.query(
        "UPDATE warehouse_inventory SET qty = qty - ? WHERE warehouse_id = ? AND product_id = ?",
        [it.qty, warehouseId, it.product_id]
      );
    }
   
    await connection.commit();
    res.json({ message: 'Order saved successfully', orderId });

  } catch (err) {
    await connection.rollback();
    console.error("Order save error:", err.message, err.stack);
    res.status(500).json({ message: 'Server error while saving order', error: err.message });
  } finally {
    connection.release();
  }
});

// ======= Get orders for a warehouse =======
app.get('/api/warehouse/orders', async (req, res) => {
  const { warehouseId, warehouseName } = req.query;

  try {
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE warehouse_name = ? ORDER BY purchase_date DESC',
      [warehouseName]
    );

    const orderIds = orders.map(o => o.order_id);
    let items = [];
    if (orderIds.length > 0) {
      const [rows] = await pool.query(
        `SELECT * FROM order_items WHERE order_id IN (?)`,
        [orderIds]
      );
      items = rows;
    }

    // attach items to orders
    const ordersWithItems = orders.map(o => ({
      ...o,
      items: items.filter(i => i.order_id === o.order_id)
    }));

    res.json(ordersWithItems);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching orders' });
  }
});

// ✅ Activity Logs - GET by warehouse name
app.get('/api/activity-logs', async (req, res) => {
  let { warehouseName } = req.query;
  if (!warehouseName) return res.status(400).json({ error: 'Missing warehouseName' });
  warehouseName = warehouseName.trim();

  try {
    const [logs] = await connection.query(`
      SELECT id, source, description, timestamp
      FROM activity_logs
      WHERE LOWER(source) LIKE CONCAT(LOWER(?), ' (%)%')
      ORDER BY timestamp DESC
      LIMIT 50
    `, [warehouseName]);

    res.json(logs);
  } catch (err) {
    console.error('❌ Error fetching activity logs:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Activity Logs - POST new log
app.post('/api/activity-logs', async (req, res) => {
  let { warehouseName, userName, description } = req.body;
  if (!warehouseName || !userName || !description) {
    return res.status(400).json({ error: '❌ Missing warehouseName, userName or description' });
  }

  warehouseName = warehouseName.trim();
  userName = userName.trim();
  description = description.trim();

  try {
    const [[warehouse]] = await connection.query('SELECT name FROM warehouses WHERE name = ?', [warehouseName]);
    if (!warehouse) return res.status(404).json({ error: '❌ Warehouse not found' });

    const source = `${warehouse.name} (${userName})`;
    await connection.query('INSERT INTO activity_logs (source, description, timestamp) VALUES (?, ?, NOW())', [source, description]);

    res.json({ success: true, message: '✅ Log saved' });
  } catch (err) {
    console.error('❌ Error inserting log:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ======================= Distributor Module =======================
// Distributor info - GET
app.get('/api/distributor/info', async (req, res) => {
  const distributorId = req.query.distributorId;
  if (!distributorId) return res.status(400).json({ error: "Missing distributorId" });

  try {
    const [rows] = await connection.query(
      "SELECT id, name, email, warehouse FROM distributors WHERE id = ?",
      [distributorId]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Distributor not found" });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("❌ Distributor Info Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Distributor stock - GET
// GET Distributor Stock (calculated from orders + sales)
// ✅ Distributor Stock Fetch
app.get('/api/distributor/stock', async (req, res) => {
  const distributorId = parseInt(req.query.distributorId, 10);

  if (!distributorId) {
    return res.status(400).json({ success: false, error: "Missing or invalid distributorId" });
  }

  try {
    // Query to get current stock including Pending Orders
    const [rows] = await connection.query(`
      SELECT 
        p.id AS productId,
        p.name AS productName,
        p.sku AS SKU,
        p.mrp AS MRP,
        COALESCE(d.qty, 0) AS QtyAvailable,
        COALESCE(SUM(CASE WHEN o.status='Pending' THEN o.qty ELSE 0 END), 0) AS PendingOrders
      FROM products p
      LEFT JOIN distributor_stock d 
        ON d.product_id = p.id AND d.distributor_id = ?
      LEFT JOIN distributor_orders o 
        ON o.product_id = p.id AND o.distributor_id = ?
      GROUP BY p.id, p.name, p.sku, p.mrp, d.qty
      ORDER BY p.name
    `, [distributorId, distributorId]);

    res.json({ success: true, stock: rows });
  } catch (err) {
    console.error("❌ /api/distributor/stock error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// =======================
// GET Products for Distributor's Warehouse
// =======================
app.get("/api/distributor/products", async (req, res) => {
  const { distributorId } = req.query;
  if (!distributorId) {
    return res.status(400).json({ error: "Missing distributorId" });
  }

  try {
    // Step 1: Get distributor's warehouse name
    const [distributor] = await connection.query(
      "SELECT warehouse FROM distributors WHERE id = ?",
      [distributorId]
    );
    if (distributor.length === 0) {
      return res.status(404).json({ error: "Distributor not found" });
    }
    const warehouseName = distributor[0].warehouse;

    // Step 2: Find warehouse_id from warehouses table using the name
    const [warehouse] = await connection.query(
      "SELECT id FROM warehouses WHERE name = ?",
      [warehouseName]
    );
    if (warehouse.length === 0) {
      return res.status(404).json({ error: "Warehouse not found" });
    }
    const warehouseId = warehouse[0].id;

    // Step 3: Get products from warehouse_inventory + products
    const [products] = await connection.query(
      `SELECT p.id, p.name, wi.qty
       FROM warehouse_inventory wi
       JOIN products p ON wi.product_id = p.id
       WHERE wi.warehouse_id = ? AND wi.qty > 0`,
      [warehouseId]
    );

    res.json({ success: true, products });
  } catch (err) {
    console.error("❌ Error fetching distributor products:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------------------
// POST: Place Distributor Order
// ------------------------------
app.post('/api/distributor/orders', async (req, res) => {
  const { distributorId, items } = req.body; // items = [{ productId, qty }, ...]
  if (!distributorId || isNaN(distributorId) || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Distributor and at least one product are required' });
  }

  const conn = await connection.getConnection(); // assuming mysql2 pool

  try {
    // Check distributor exists
    const [distRows] = await conn.query(
      'SELECT id, warehouse FROM distributors WHERE id = ?',
      [distributorId]
    );
    if (distRows.length === 0) return res.status(404).json({ error: 'Distributor not found' });
    const distributor = distRows[0];

    // Start transaction
    await conn.beginTransaction();
    const orderId = uuidv4(); // same order_id for all products

    // Prepare batch arrays
    const incomingOrdersValues = [];
    const distributorOrdersValues = [];

    for (const item of items) {
      const { productId, qty } = item;
      if (!productId || !qty || qty <= 0) throw new Error('Invalid product or quantity');

      incomingOrdersValues.push([orderId, distributor.warehouse, distributorId, productId, qty, 'Pending']);
      distributorOrdersValues.push([orderId, distributor.warehouse, distributorId, productId, qty, 'Pending']);
    }

    // Batch insert into incoming_orders
    await conn.query(
      `INSERT INTO incoming_orders (order_id, warehouse, distributor_id, product_id, qty, status)
       VALUES ?`,
      [incomingOrdersValues]
    );

    // Batch insert into distributor_orders
    await conn.query(
      `INSERT INTO distributor_orders (order_id, warehouse, distributor_id, product_id, qty, status)
       VALUES ?`,
      [distributorOrdersValues]
    );

    await conn.commit();
    res.json({ success: true, message: 'Order placed successfully', orderId });

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to place order' });
  } finally {
    conn.release();
  }
});

// ------------------------------
// GET: Distributor Order History
// ------------------------------
app.get('/api/distributor/orders', async (req, res) => {
  const distributorId = parseInt(req.query.distributorId, 10);
  if (!distributorId) return res.status(400).json({ error: 'Missing distributorId' });

  try {
    const [orders] = await connection.query(
      `SELECT 
         o.order_id,
         o.warehouse AS warehouse_name,
         d.name AS distributor_name,
         p.name AS product_name,
         o.qty,
         o.status,
         DATE_FORMAT(CONVERT_TZ(o.created_at, '+00:00', '+05:30'), '%d-%m-%Y %H:%i:%s') AS created_at
       FROM distributor_orders o
       JOIN distributors d ON o.distributor_id = d.id
       JOIN products p ON o.product_id = p.id
       WHERE o.distributor_id = ?
       ORDER BY o.created_at DESC`,
      [distributorId]
    );

    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// =======================
// POST Confirm Delivery
// =======================
app.post('/api/distributor/confirm-delivery', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId)
      return res.status(400).json({ success: false, message: "Missing orderId" });

    // Check order exists & Shipped
    const [check] = await connection.query(
      "SELECT distributor_id, product_id, qty, status FROM distributor_orders WHERE order_id = ?",
      [orderId]
    );

    if (check.length === 0)
      return res.status(404).json({ success: false, message: "Order not found" });

    if (check[0].status !== "Shipped")
      return res.status(400).json({ success: false, message: "Only Shipped orders can be confirmed delivered" });

    // Update status → Delivered in both tables
    await connection.query(
      "UPDATE distributor_orders SET status = 'Delivered' WHERE order_id = ? AND status = 'Shipped'",
      [orderId]
    );

    await connection.query(
      "UPDATE incoming_orders SET status = 'Delivered' WHERE order_id = ? AND status = 'Shipped'",
      [orderId]
    );

    // ✅ Update Distributor Stock
    const order = check[0];
await connection.query(`
  INSERT INTO distributor_stock (distributor_id, product_id, qty)
  VALUES (?, ?, ?)
  ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)
`, [order.distributor_id, order.product_id, order.qty]);

    res.json({ success: true, message: "Delivery confirmed" });
  } catch (err) {
    console.error("❌ /api/distributor/confirm-delivery error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Distributor Sales - POST
app.post('/api/distributor/sales', async (req, res) => {
  let { distributorId, productId, qty } = req.body;

  // Convert to integers
  distributorId = parseInt(distributorId, 10);
  productId = parseInt(productId, 10);
  qty = parseInt(qty, 10);

  if (!distributorId || !productId || !qty || qty <= 0)
    return res.status(400).json({ error: "Invalid sales data" });

  try {
    const [[stock]] = await connection.query(
      "SELECT qty FROM distributor_stock WHERE distributor_id = ? AND product_id = ?",
      [distributorId, productId]
    );
    if (!stock) {
      return res.status(400).json({ error: "Product not found in distributor stock" });
    }
    if (stock.qty < qty) {
      return res.status(400).json({ error: `Only ${stock.qty} units available in stock` });
    }

    await connection.query(
      "INSERT INTO sales (distributor_id, product_id, qty, created_at) VALUES (?, ?, ?, NOW())",
      [distributorId, productId, qty]
    );

    await connection.query(
      "UPDATE distributor_stock SET qty = qty - ? WHERE distributor_id = ? AND product_id = ?",
      [qty, distributorId, productId]
    );

    // Activity log
    const [[distributor]] = await connection.query("SELECT name FROM distributors WHERE id = ?", [distributorId]);
    const [[product]] = await connection.query("SELECT name FROM products WHERE id = ?", [productId]);
    await connection.query(
      "INSERT INTO activity_logs (source, description) VALUES (?, ?)",
      [distributor.name, `Sold ${qty} units of ${product.name}`]
    );

    res.json({ success: true, message: 'Sale recorded', productName: product.name });
  } catch (err) {
    console.error("❌ Record Sales Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Distributor Sales History - GET
app.get('/api/distributor/sales', async (req, res) => {
  const distributorId = parseInt(req.query.distributorId, 10);
  if (!distributorId) return res.status(400).json({ error: "Missing distributorId" });

  try {
    const [rows] = await connection.query(`
      SELECT s.id AS id, s.qty, s.created_at AS date, p.name AS productName
      FROM sales s
      JOIN products p ON s.product_id = p.id
      WHERE s.distributor_id = ?
      ORDER BY s.created_at DESC
    `, [distributorId]);

    res.json({ success: true, sales: rows });
  } catch (err) {
    console.error("❌ Distributor Sales History Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Activity log - POST
app.post('/api/activity-log', async (req, res) => {
  const { source, description } = req.body;
  if (!source || !description) return res.status(400).json({ error: "Missing source or description" });

  try {
    await connection.query(
      "INSERT INTO activity_logs (source, description) VALUES (?, ?)",
      [source, description]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Activity Log Error:", err.message);
    res.status(500).json({ error: "Failed to log activity" });
  }
});

// ✅ Admin dashboard summary
app.get('/api/admin/summary', async (req, res) => {
  try {
    const [[productCount]] = await connection.query('SELECT COUNT(*) AS totalProducts FROM products');
    const [[warehouseCount]] = await connection.query('SELECT COUNT(*) AS totalWarehouses FROM warehouses');
    const [[distributorCount]] = await connection.query('SELECT COUNT(*) AS totalDistributors FROM distributors');
    const [[salesCount]] = await connection.query('SELECT COUNT(*) AS totalSales FROM sales');
    const [[orderCount]] = await connection.query('SELECT COUNT(*) AS totalOrders FROM incoming_orders');

    res.json({
  totalProducts: productCount.totalProducts,
  totalWarehouses: warehouseCount.totalWarehouses,
  totalDistributors: distributorCount.totalDistributors,
  totalSales: salesCount.totalSales,
  totalOrders: orderCount.totalOrders
});

  } catch (error) {
    console.error("❌ Admin Summary Error:", error.message);
    res.status(500).json({ error: "Server error while fetching summary" });
  }
});

// ✅ Admin distributor sales summary
app.get("/api/admin/distributor-sales", async (req, res) => {
  try {
    const [rows] = await connection.query(`
      SELECT d.name AS distributor, p.name AS product, SUM(s.qty) AS totalSold
      FROM sales s
      JOIN distributors d ON s.distributor_id = d.id
      JOIN products p ON s.product_id = p.id
      GROUP BY s.distributor_id, s.product_id
      ORDER BY totalSold DESC
    `);
    res.json({ success: true, sales: rows });
  } catch (err) {
    console.error("❌ Distributor Sales Error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});
// ✅ Default route
app.get('/', (req, res) => {
  res.send('✅ Millet Inventory Backend Running Successfully!');
});

app.get('/api/healthcheck', (req, res) => {
  res.json({ status: 'ok' });
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
