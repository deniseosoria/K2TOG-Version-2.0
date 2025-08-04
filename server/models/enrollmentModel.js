const pool = require('../config/db');

// Enroll a user in a class (now creates a pending enrollment)
const enrollUserInClass = async (userId, classId, sessionId, paymentStatus = 'paid') => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create the enrollment
    const result = await client.query(
      `INSERT INTO enrollments (user_id, class_id, session_id, payment_status, enrollment_status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [userId, classId, sessionId, paymentStatus]
    );
    
    // Update the session enrollment count
    await client.query(
      `UPDATE class_sessions SET enrolled_count = enrolled_count + 1 WHERE id = $1`,
      [sessionId]
    );
    
    // Automatically convert user to student if not already
    await client.query(
      `UPDATE users SET role = 'student' WHERE id = $1 AND role != 'student'`,
      [userId]
    );
    
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Approve an enrollment
const approveEnrollment = async (enrollmentId, adminId, adminNotes = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get the enrollment with session_id and current status before updating
    const enrollmentResult = await client.query(
      `SELECT session_id, enrollment_status FROM enrollments WHERE id = $1`,
      [enrollmentId]
    );
    
    if (enrollmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Enrollment not found');
    }
    
    const sessionId = enrollmentResult.rows[0].session_id;
    const currentStatus = enrollmentResult.rows[0].enrollment_status;
    
    // Update the enrollment status
    const result = await client.query(
      `UPDATE enrollments 
       SET enrollment_status = 'approved',
           admin_notes = $1,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $2
       WHERE id = $3
       RETURNING *`,
      [adminNotes, adminId, enrollmentId]
    );
    
    // If the enrollment was previously rejected, increment the session enrollment count
    if (currentStatus === 'rejected') {
      await client.query(
        `UPDATE class_sessions SET enrolled_count = enrolled_count + 1 WHERE id = $1`,
        [sessionId]
      );
    }
    
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Reject an enrollment
const rejectEnrollment = async (enrollmentId, adminId, adminNotes = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get the enrollment with session_id before updating
    const enrollmentResult = await client.query(
      `SELECT session_id FROM enrollments WHERE id = $1`,
      [enrollmentId]
    );
    
    if (enrollmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Enrollment not found');
    }
    
    const sessionId = enrollmentResult.rows[0].session_id;
    
    // Update the enrollment status
    const result = await client.query(
      `UPDATE enrollments 
       SET enrollment_status = 'rejected',
           admin_notes = $1,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $2
       WHERE id = $3
       RETURNING *`,
      [adminNotes, adminId, enrollmentId]
    );
    
    // Decrement the session enrollment count
    await client.query(
      `UPDATE class_sessions SET enrolled_count = GREATEST(enrolled_count - 1, 0) WHERE id = $1`,
      [sessionId]
    );
    
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Set enrollment to pending
const setEnrollmentPending = async (enrollmentId, adminId, adminNotes = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get the enrollment with session_id and current status before updating
    const enrollmentResult = await client.query(
      `SELECT session_id, enrollment_status FROM enrollments WHERE id = $1`,
      [enrollmentId]
    );
    
    if (enrollmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Enrollment not found');
    }
    
    const sessionId = enrollmentResult.rows[0].session_id;
    const currentStatus = enrollmentResult.rows[0].enrollment_status;
    
    // Update the enrollment status
    const result = await client.query(
      `UPDATE enrollments 
       SET enrollment_status = 'pending',
           admin_notes = $1,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $2
       WHERE id = $3
       RETURNING *`,
      [adminNotes, adminId, enrollmentId]
    );
    
    // If the enrollment was previously rejected, increment the session enrollment count
    if (currentStatus === 'rejected') {
      await client.query(
        `UPDATE class_sessions SET enrolled_count = enrolled_count + 1 WHERE id = $1`,
        [sessionId]
      );
    }
    
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get pending enrollments (for admin)
const getPendingEnrollments = async () => {
  const result = await pool.query(`
    SELECT e.*, 
           u.name as user_name, 
           u.email as user_email,
           c.title as class_title,
           c.location_details,
           cs.session_date as class_date,
           cs.start_time,
           cs.end_time,
           cs.end_date,
           CASE 
             WHEN cs.end_date IS NULL OR cs.session_date = cs.end_date THEN
               TO_CHAR(cs.session_date, 'MM/DD/YY')
             ELSE
               TO_CHAR(cs.session_date, 'MM/DD/YY') || ' - ' || TO_CHAR(cs.end_date, 'MM/DD/YY')
           END AS display_date,
           a.name as reviewer_name
    FROM enrollments e
    JOIN users u ON u.id = e.user_id
    JOIN classes c ON c.id = e.class_id
    LEFT JOIN class_sessions cs ON cs.id = e.session_id
    LEFT JOIN users a ON a.id = e.reviewed_by
    WHERE e.enrollment_status = 'pending'
    ORDER BY e.enrolled_at DESC
  `);
  return result.rows;
};

// Get enrollment by ID
const getEnrollmentById = async (enrollmentId) => {
  const result = await pool.query(`
    SELECT e.*, 
           u.name as user_name, 
           u.email as user_email,
           c.title as class_title,
           c.location_details,
           cs.session_date as class_date,
           cs.start_time,
           cs.end_time,
           cs.end_date,
           CASE 
             WHEN cs.end_date IS NULL OR cs.session_date = cs.end_date THEN
               TO_CHAR(cs.session_date, 'MM/DD/YY')
             ELSE
               TO_CHAR(cs.session_date, 'MM/DD/YY') || ' - ' || TO_CHAR(cs.end_date, 'MM/DD/YY')
           END AS display_date,
           a.name as reviewer_name
    FROM enrollments e
    JOIN users u ON u.id = e.user_id
    JOIN classes c ON c.id = e.class_id
    LEFT JOIN class_sessions cs ON cs.id = e.session_id
    LEFT JOIN users a ON a.id = e.reviewed_by
    WHERE e.id = $1
  `, [enrollmentId]);
  return result.rows[0];
};

// Cancel a user's enrollment
const cancelEnrollment = async (userId, classId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get the enrollment with session_id before deleting
    const enrollmentResult = await client.query(
      `SELECT session_id FROM enrollments 
       WHERE user_id = $1 
       AND class_id = $2 
       AND enrollment_status = 'approved'`,
      [userId, classId]
    );
    
    if (enrollmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    
    const sessionId = enrollmentResult.rows[0].session_id;
    
    // Delete the enrollment
    const result = await client.query(
      `DELETE FROM enrollments 
       WHERE user_id = $1 
       AND class_id = $2 
       AND enrollment_status = 'approved'
       RETURNING *`,
      [userId, classId]
    );
    
    // Decrement the session enrollment count
    await client.query(
      `UPDATE class_sessions SET enrolled_count = GREATEST(enrolled_count - 1, 0) WHERE id = $1`,
      [sessionId]
    );
    
    await client.query('COMMIT');
    return { ...result.rows[0], session_id: sessionId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get all enrollments for a specific user (active and historical)
const getUserEnrollments = async (userId) => {
  const client = await pool.connect();
  try {
    // Get active enrollments
    const activeResult = await client.query(
      `SELECT 
        classes.id as class_id,
        classes.title as class_title,
        class_sessions.id as session_id,
        TO_CHAR(class_sessions.session_date, 'MM/DD/YY') as formatted_date,
        class_sessions.session_date,
        class_sessions.start_time,
        class_sessions.end_time,
        class_sessions.end_date,
        class_sessions.capacity,
        class_sessions.enrolled_count as current_students,
        classes.location_details,
        CASE 
          WHEN (class_sessions.end_date IS NOT NULL AND class_sessions.end_date < NOW())
            OR (class_sessions.end_date IS NULL AND class_sessions.session_date < NOW())
          THEN 'historical'
          ELSE 'active'
        END AS enrollment_type,
        enrollments.payment_status, 
        enrollments.enrollment_status,
        enrollments.enrolled_at,
        enrollments.admin_notes,
        enrollments.reviewed_at,
        users.name as reviewer_name,
        instructor.name as instructor_name,
        CASE 
          WHEN class_sessions.end_date IS NULL OR class_sessions.session_date = class_sessions.end_date THEN
            TO_CHAR(class_sessions.session_date, 'MM/DD/YY')
          ELSE
            TO_CHAR(class_sessions.session_date, 'MM/DD/YY') || ' - ' || TO_CHAR(class_sessions.end_date, 'MM/DD/YY')
        END AS display_date,
        NULL as archived_at,
        NULL as archived_reason
       FROM enrollments
       JOIN classes ON classes.id = enrollments.class_id
       LEFT JOIN class_sessions ON class_sessions.id = enrollments.session_id AND class_sessions.deleted_at IS NULL
       LEFT JOIN users ON users.id = enrollments.reviewed_by
       LEFT JOIN users instructor ON instructor.id = class_sessions.instructor_id
       WHERE enrollments.user_id = $1
       ORDER BY class_sessions.session_date ASC, class_sessions.start_time ASC`,
      [userId]
    );

    // Get historical enrollments (from deleted sessions) - deduplicated by original session
    const historicalResult = await client.query(
      `SELECT 
        he.class_id,
        c.title as class_title,
        he.session_id,
        TO_CHAR(hs.session_date, 'MM/DD/YY') as formatted_date,
        hs.session_date,
        hs.start_time,
        hs.end_time,
        hs.end_date,
        hs.capacity,
        hs.enrolled_count as current_students,
        c.location_details,
        'historical' as enrollment_type,
        he.payment_status, 
        he.enrollment_status,
        he.enrolled_at,
        he.admin_notes,
        he.reviewed_at,
        u.name as reviewer_name,
        instructor.name as instructor_name,
        CASE 
          WHEN hs.end_date IS NULL OR hs.session_date = hs.end_date THEN
            TO_CHAR(hs.session_date, 'MM/DD/YY')
          ELSE
            TO_CHAR(hs.session_date, 'MM/DD/YY') || ' - ' || TO_CHAR(hs.end_date, 'MM/DD/YY')
        END AS display_date,
        he.archived_at,
        he.archived_reason
       FROM (
         SELECT DISTINCT ON (he.user_id, hs.original_session_id) 
           he.id,
           he.class_id,
           he.session_id,
           he.historical_session_id,
           he.payment_status, 
           he.enrollment_status,
           he.enrolled_at,
           he.admin_notes,
           he.reviewed_at,
           he.reviewed_by,
           he.archived_at,
           he.archived_reason
         FROM historical_enrollments he
         JOIN historical_sessions hs ON hs.id = he.historical_session_id
         WHERE he.user_id = $1
         ORDER BY he.user_id, hs.original_session_id, COALESCE(he.archived_at, '1900-01-01'::timestamp) DESC
       ) he
       JOIN classes c ON c.id = he.class_id
       JOIN historical_sessions hs ON hs.id = he.historical_session_id
       LEFT JOIN users u ON u.id = he.reviewed_by
       LEFT JOIN users instructor ON instructor.id = hs.instructor_id
       ORDER BY hs.session_date ASC, hs.start_time ASC`,
      [userId]
    );

    // Combine and sort all enrollments
    const allEnrollments = [...activeResult.rows, ...historicalResult.rows];
    allEnrollments.sort((a, b) => {
      const dateA = a.session_date ? new Date(a.session_date) : new Date(0);
      const dateB = b.session_date ? new Date(b.session_date) : new Date(0);
      return dateA - dateB;
    });

    console.log('getUserEnrollments result for user', userId, ':', {
      activeCount: activeResult.rows.length,
      historicalCount: historicalResult.rows.length,
      totalCount: allEnrollments.length,
      activeEnrollments: activeResult.rows,
      historicalEnrollments: historicalResult.rows
    });

    return allEnrollments;
  } finally {
    client.release();
  }
};

// Get historical enrollments for a specific user
const getHistoricalEnrollmentsByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT 
      he.class_id,
      c.title as class_title,
      he.session_id,
      TO_CHAR(hs.session_date, 'MM/DD/YY') as formatted_date,
      hs.session_date,
      hs.start_time,
      hs.end_time,
      hs.end_date,
      'historical' as enrollment_type,
      he.payment_status, 
      he.enrollment_status,
      he.enrolled_at,
      he.admin_notes,
      he.reviewed_at,
      u.name as reviewer_name,
      CASE 
        WHEN hs.end_date IS NULL OR hs.session_date = hs.end_date THEN
          TO_CHAR(hs.session_date, 'MM/DD/YY')
        ELSE
          TO_CHAR(hs.session_date, 'MM/DD/YY') || ' - ' || TO_CHAR(hs.end_date, 'MM/DD/YY')
      END AS display_date,
      he.archived_at,
      he.archived_reason
     FROM historical_enrollments he
     JOIN classes c ON c.id = he.class_id
     JOIN historical_sessions hs ON hs.id = he.historical_session_id
     LEFT JOIN users u ON u.id = he.reviewed_by
     WHERE he.user_id = $1
     ORDER BY hs.session_date ASC, hs.start_time ASC`,
    [userId]
  );
  return result.rows;
};

// Check if a user is already enrolled in a specific class
const isUserAlreadyEnrolled = async (userId, classId) => {
  const result = await pool.query(
    `SELECT * FROM enrollments WHERE user_id = $1 AND class_id = $2 AND enrollment_status IN ('approved', 'pending')`,
    [userId, classId]
  );
  return result.rows.length > 0;
};

// Get all enrollments (admin view)
const getAllEnrollments = async (filters = {}) => {
  const { status, class_id, user_id, start_date, end_date, page = 1, limit = 20 } = filters;
  
  console.log('getAllEnrollments called with filters:', filters);
  
  let query = `
    SELECT 
      e.*,
      u.name as student_name,
      u.email as student_email,
      c.title as class_name,
      c.location_details,
      cs.session_date as class_date,
      cs.start_time,
      cs.end_time,
      cs.end_date,
      CASE 
        WHEN cs.end_date IS NULL OR cs.session_date = cs.end_date THEN
          TO_CHAR(cs.session_date, 'MM/DD/YY')
        ELSE
          TO_CHAR(cs.session_date, 'MM/DD/YY') || ' - ' || TO_CHAR(cs.end_date, 'MM/DD/YY')
      END AS display_date,
      reviewer.name as reviewer_name,
      TO_CHAR(e.enrolled_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as enrollment_date
    FROM enrollments e
    JOIN users u ON u.id = e.user_id
    JOIN classes c ON c.id = e.class_id
    LEFT JOIN class_sessions cs ON cs.id = e.session_id
    LEFT JOIN users reviewer ON reviewer.id = e.reviewed_by
    WHERE u.role NOT IN ('admin', 'instructor')
  `;
  let countQuery = `SELECT COUNT(*) FROM enrollments e JOIN users u ON u.id = e.user_id WHERE u.role NOT IN ('admin', 'instructor')`;
  
  const queryParams = [];
  const countParams = [];
  let paramCount = 1;

  if (status && status !== 'all') {
    query += ` AND e.enrollment_status = $${paramCount}`;
    countQuery += ` AND e.enrollment_status = $${paramCount}`;
    queryParams.push(status);
    countParams.push(status);
    paramCount++;
  }
  if (class_id && class_id !== 'all') {
    query += ` AND e.class_id = $${paramCount}`;
    countQuery += ` AND e.class_id = $${paramCount}`;
    queryParams.push(class_id);
    countParams.push(class_id);
    paramCount++;
  }
  if (user_id && user_id !== 'all') {
    query += ` AND e.user_id = $${paramCount}`;
    countQuery += ` AND e.user_id = $${paramCount}`;
    queryParams.push(user_id);
    countParams.push(user_id);
    paramCount++;
  }
  if (start_date) {
    query += ` AND e.enrolled_at >= $${paramCount}`;
    countQuery += ` AND e.enrolled_at >= $${paramCount}`;
    queryParams.push(start_date);
    countParams.push(start_date);
    paramCount++;
  }
  if (end_date) {
    query += ` AND e.enrolled_at <= $${paramCount}`;
    countQuery += ` AND e.enrolled_at <= $${paramCount}`;
    queryParams.push(end_date);
    countParams.push(end_date);
    paramCount++;
  }

  query += ` ORDER BY e.enrolled_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
  queryParams.push(limit);
  queryParams.push((page - 1) * limit);

  const [result, countResult] = await Promise.all([
    pool.query(query, queryParams),
    pool.query(countQuery, countParams)
  ]);
  return {
    enrollments: result.rows,
    total: parseInt(countResult.rows[0].count, 10)
  };
};

module.exports = {
  enrollUserInClass,
  approveEnrollment,
  rejectEnrollment,
  setEnrollmentPending,
  getPendingEnrollments,
  getEnrollmentById,
  cancelEnrollment,
  getUserEnrollments,
  getHistoricalEnrollmentsByUserId,
  getAllEnrollments,
  isUserAlreadyEnrolled
};
