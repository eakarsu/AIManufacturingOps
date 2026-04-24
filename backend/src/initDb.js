const pool = require('./db');

const initDatabase = async () => {
  const client = await pool.connect();

  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        email_verified BOOLEAN DEFAULT false,
        verification_token VARCHAR(255),
        phone VARCHAR(50),
        department VARCHAR(100),
        avatar_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns to users if they don't exist
    const userCols = ['email_verified', 'verification_token', 'phone', 'department', 'avatar_url'];
    for (const col of userCols) {
      try {
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col} ${
          col === 'email_verified' ? 'BOOLEAN DEFAULT false' :
          col === 'avatar_url' ? 'VARCHAR(500)' :
          col === 'verification_token' ? 'VARCHAR(255)' :
          col === 'phone' ? 'VARCHAR(50)' : 'VARCHAR(100)'
        }`);
      } catch (e) { /* column may already exist */ }
    }

    // Equipment table for Predictive Maintenance
    await client.query(`
      CREATE TABLE IF NOT EXISTS equipment (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        location VARCHAR(255),
        status VARCHAR(50) DEFAULT 'operational',
        last_maintenance DATE,
        next_maintenance DATE,
        temperature DECIMAL(5,2),
        vibration DECIMAL(5,2),
        runtime_hours INTEGER,
        failure_probability DECIMAL(5,2),
        ai_prediction TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Routes table for Route Optimizer
    await client.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        origin VARCHAR(255) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        distance DECIMAL(10,2),
        estimated_time INTEGER,
        vehicle_type VARCHAR(100),
        priority VARCHAR(50) DEFAULT 'normal',
        status VARCHAR(50) DEFAULT 'pending',
        waypoints TEXT,
        ai_optimization TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Safety Incidents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS safety_incidents (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        location VARCHAR(255),
        severity VARCHAR(50) DEFAULT 'low',
        incident_type VARCHAR(100),
        reported_by VARCHAR(255),
        status VARCHAR(50) DEFAULT 'open',
        risk_score DECIMAL(5,2),
        ai_prediction TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Assembly Lines table
    await client.query(`
      CREATE TABLE IF NOT EXISTS assembly_lines (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        product VARCHAR(255),
        capacity INTEGER,
        current_output INTEGER,
        efficiency DECIMAL(5,2),
        workers INTEGER,
        stations INTEGER,
        bottleneck VARCHAR(255),
        status VARCHAR(50) DEFAULT 'running',
        ai_optimization TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Supply Chain table
    await client.query(`
      CREATE TABLE IF NOT EXISTS supply_chain (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR(255) NOT NULL,
        supplier VARCHAR(255),
        origin_location VARCHAR(255),
        current_location VARCHAR(255),
        destination VARCHAR(255),
        quantity INTEGER,
        status VARCHAR(50) DEFAULT 'in_transit',
        estimated_arrival DATE,
        tracking_number VARCHAR(100),
        ai_analysis TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Password Resets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        type VARCHAR(50) DEFAULT 'info',
        severity VARCHAR(50) DEFAULT 'low',
        related_entity VARCHAR(100),
        related_id INTEGER,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audit Logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        user_email VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id INTEGER,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Shifts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shifts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        supervisor VARCHAR(255),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        department VARCHAR(100),
        workers_assigned INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Feedback table
    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_email VARCHAR(255),
        type VARCHAR(50) DEFAULT 'general',
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        rating INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        admin_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // File Uploads table
    await client.query(`
      CREATE TABLE IF NOT EXISTS file_uploads (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(500) NOT NULL,
        original_name VARCHAR(500) NOT NULL,
        mime_type VARCHAR(100),
        size INTEGER,
        entity_type VARCHAR(100),
        entity_id INTEGER,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User Settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        theme VARCHAR(20) DEFAULT 'dark',
        email_notifications BOOLEAN DEFAULT true,
        push_notifications BOOLEAN DEFAULT false,
        language VARCHAR(10) DEFAULT 'en',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('All tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = initDatabase;
