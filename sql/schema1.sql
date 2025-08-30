CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE,
  password VARCHAR(255),
  userType ENUM('admin', 'warehouse', 'distributor')
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sku VARCHAR(100) NOT NULL UNIQUE,
  ean VARCHAR(50),
  unit VARCHAR(20),
  qty INT DEFAULT 0,
  mrp DECIMAL(10,2) DEFAULT 0.00
);

CREATE TABLE stock_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(100) NOT NULL,
  qty INT NOT NULL,
  unit_mrp DECIMAL(10,2) NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouse (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  location VARCHAR(100),
  email VARCHAR(100) UNIQUE,
  password VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS distributors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100) UNIQUE,
  password VARCHAR(255),
  city VARCHAR(100),
  warehouse INT
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT,
  distributor_id INT,
  warehouse_id INT,
  qty INT,
  status ENUM('pending', 'delivered') DEFAULT 'pending',
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dispatch_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warehouse_id INT,
  product_id INT,
  quantity INT,
  dispatched_to INT,  -- fix here
  dispatch_date DATETIME DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE IF NOT EXISTS direct_sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warehouse_id INT,
  product_id INT,
  customer_name VARCHAR(100),
  quantity INT,
  amount DECIMAL(10, 2),
  sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_purchase (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_name VARCHAR(255),
  quantity INT,
  total_price DECIMAL(10, 2),
  customer_name VARCHAR(100),
  warehouse_id INT,
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
