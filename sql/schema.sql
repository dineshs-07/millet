CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  sku VARCHAR(50),
  ean VARCHAR(50),
  unit VARCHAR(20),
  qty INT,
  mrp DECIMAL(10,2)
);


CREATE TABLE IF NOT EXISTS warehouse (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  location VARCHAR(100),
  email VARCHAR(100),
  password VARCHAR(255)
);


CREATE TABLE IF NOT EXISTS distributors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  city VARCHAR(100),
  email VARCHAR(100),
  password VARCHAR(255),
  warehouse_id INT
);


CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  distributor_name VARCHAR(255),
  product_name VARCHAR(255),
  quantity INT,
  status VARCHAR(50) DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🧱 Inventory Table
CREATE TABLE warehouse_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warehouseId INT,
  name VARCHAR(100),
  sku VARCHAR(50) UNIQUE,
  qty INT,
  mrp DECIMAL(10,2),
  ean VARCHAR(50),
  unit VARCHAR(50)
);

-- 📬 Orders Table
CREATE TABLE warehouse_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warehouseId INT,
  distributorName VARCHAR(100),
  productName VARCHAR(100),
  qty INT,
  status VARCHAR(20) DEFAULT 'pending'
);

-- 🚚 Dispatch Log Table
CREATE TABLE warehouse_dispatch_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderId INT,
  warehouseId INT,
  distributorName VARCHAR(100),
  productName VARCHAR(100),
  qty INT,
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distributor_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  distributor_id INT,
  product_id INT,
  qty INT DEFAULT 0,
  UNIQUE KEY (distributor_id, product_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  distributor_id INT,
  product_id INT,
  qty INT,
  date DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS distributor_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  distributor_id INT,
  product_id INT,
  warehouse_id INT,
  qty INT,
  status VARCHAR(20),
  date DATETIME DEFAULT CURRENT_TIMESTAMP
);
