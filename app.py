import os
import sqlite3
import calendar
from functools import wraps
from datetime import datetime
from flask import Flask, request, jsonify, session, redirect, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='static', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
DB_PATH = os.path.join(os.path.dirname(__file__), 'attendance.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        seat_num INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        UNIQUE(class_id, seat_num)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        UNIQUE(student_id, date)
    );
    """)

    cursor.execute("SELECT COUNT(*) FROM teachers")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO teachers (username, password_hash, display_name) VALUES (?, ?, ?)",
                       ("teacher", generate_password_hash("teacher123", method="pbkdf2:sha256"), "導師"))
        cursor.execute("INSERT INTO teachers (username, password_hash, display_name) VALUES (?, ?, ?)",
                       ("admin", generate_password_hash("admin123", method="pbkdf2:sha256"), "系統管理員"))

    cursor.execute("SELECT COUNT(*) FROM classes")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO classes (name) VALUES (?)", ("高一甲班",))
        class_id = cursor.lastrowid
        default_students = [
            (1,'王小明'),(2,'李小華'),(3,'張大為'),(4,'陳美玲'),
            (5,'林怡君'),(6,'黃志明'),(7,'劉雅文'),(8,'吳佳穎'),
            (9,'許文豪'),(10,'鄭雅婷'),(11,'謝佳蓉'),(12,'周志偉'),
            (13,'楊淑芬'),(14,'蔡宗翰'),(15,'徐雅琳'),(16,'郭俊宏'),
            (17,'邱怡婷'),(18,'賴建宏'),(19,'蘇佩珊'),(20,'江柏翰'),
        ]
        for num, name in default_students:
            cursor.execute("INSERT INTO students (class_id, seat_num, name) VALUES (?, ?, ?)",
                           (class_id, num, name))
        cursor.execute("INSERT INTO classes (name) VALUES (?)", ("高一乙班",))
        class_id_b = cursor.lastrowid
        default_students_b = [
            (1,'陳冠宇'),(2,'林哲宇'),(3,'張家豪'),(4,'黃宥廷'),
            (5,'李奕軒'),(6,'劉品妤'),(7,'吳芊妤'),(8,'蔡羽婕'),
            (9,'楊雅婷'),(10,'陳怡安'),
        ]
        for num, name in default_students_b:
            cursor.execute("INSERT INTO students (class_id, seat_num, name) VALUES (?, ?, ?)",
                           (class_id_b, num, name))

    conn.commit()
    conn.close()

init_db()

# ── Auth decorator ────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'teacher_id' not in session:
            return jsonify({'error': '請先登入'}), 401
        return f(*args, **kwargs)
    return decorated

# ── Pages ─────────────────────────────────────────────────
@app.route('/')
def index():
    if 'teacher_id' not in session:
        return redirect('/login')
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/login')
def login_page():
    if 'teacher_id' in session:
        return redirect('/')
    return send_from_directory(app.static_folder, 'login.html')

# ── Auth API ──────────────────────────────────────────────
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM teachers WHERE username = ?", (username,))
    teacher = cursor.fetchone()
    conn.close()

    if not teacher or not check_password_hash(teacher['password_hash'], password):
        return jsonify({'error': '帳號或密碼錯誤'}), 401

    session['teacher_id'] = teacher['id']
    session['teacher_name'] = teacher['display_name']
    session['username'] = teacher['username']
    session.permanent = True

    return jsonify({
        'id': teacher['id'],
        'username': teacher['username'],
        'display_name': teacher['display_name']
    })

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'message': '已登出'})

@app.route('/api/me')
def api_me():
    if 'teacher_id' not in session:
        return jsonify({'error': '未登入'}), 401
    return jsonify({
        'id': session['teacher_id'],
        'username': session.get('username'),
        'display_name': session.get('teacher_name')
    })

# ── Classes API ───────────────────────────────────────────
@app.route('/api/classes', methods=['GET', 'POST'])
@login_required
def handle_classes():
    conn = get_db()
    cursor = conn.cursor()
    if request.method == 'GET':
        cursor.execute("SELECT * FROM classes ORDER BY name")
        classes = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(classes)
    elif request.method == 'POST':
        data = request.json
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': '班級名稱不能為空'}), 400
        try:
            cursor.execute("INSERT INTO classes (name) VALUES (?)", (name,))
            conn.commit()
            class_id = cursor.lastrowid
            conn.close()
            return jsonify({'id': class_id, 'name': name}), 201
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'error': '班級名稱已存在'}), 400

@app.route('/api/classes/<int:class_id>', methods=['DELETE', 'PUT'])
@login_required
def handle_class_detail(class_id):
    conn = get_db()
    cursor = conn.cursor()
    if request.method == 'DELETE':
        cursor.execute("DELETE FROM classes WHERE id = ?", (class_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': '班級刪除成功'})
    elif request.method == 'PUT':
        data = request.json
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': '班級名稱不能為空'}), 400
        try:
            cursor.execute("UPDATE classes SET name = ? WHERE id = ?", (name, class_id))
            conn.commit()
            conn.close()
            return jsonify({'id': class_id, 'name': name})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'error': '班級名稱已存在'}), 400

# ── Students API ──────────────────────────────────────────
@app.route('/api/classes/<int:class_id>/students', methods=['GET', 'POST'])
@login_required
def handle_students(class_id):
    conn = get_db()
    cursor = conn.cursor()
    if request.method == 'GET':
        cursor.execute("SELECT * FROM students WHERE class_id = ? ORDER BY seat_num", (class_id,))
        students = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(students)
    elif request.method == 'POST':
        data = request.json
        seat_num = data.get('seat_num')
        name = data.get('name', '').strip()
        if not seat_num or not name:
            return jsonify({'error': '座號與姓名不能為空'}), 400
        try:
            cursor.execute("INSERT INTO students (class_id, seat_num, name) VALUES (?, ?, ?)",
                           (class_id, seat_num, name))
            conn.commit()
            student_id = cursor.lastrowid
            conn.close()
            return jsonify({'id': student_id, 'class_id': class_id, 'seat_num': seat_num, 'name': name}), 201
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'error': f'該班級已存在座號 {seat_num}'}), 400

@app.route('/api/students/<int:student_id>', methods=['PUT', 'DELETE'])
@login_required
def handle_student_detail(student_id):
    conn = get_db()
    cursor = conn.cursor()
    if request.method == 'PUT':
        data = request.json
        seat_num = data.get('seat_num')
        name = data.get('name', '').strip()
        if not seat_num or not name:
            return jsonify({'error': '座號與姓名不能為空'}), 400
        try:
            cursor.execute("SELECT class_id FROM students WHERE id = ?", (student_id,))
            student = cursor.fetchone()
            if not student:
                conn.close()
                return jsonify({'error': '找不到此學生'}), 404
            cursor.execute("UPDATE students SET seat_num = ?, name = ? WHERE id = ?",
                           (seat_num, name, student_id))
            conn.commit()
            conn.close()
            return jsonify({'id': student_id, 'seat_num': seat_num, 'name': name})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'error': f'該班級已存在座號 {seat_num}'}), 400
    elif request.method == 'DELETE':
        cursor.execute("DELETE FROM students WHERE id = ?", (student_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': '學生刪除成功'})

# ── Attendance API ────────────────────────────────────────
@app.route('/api/attendance', methods=['GET', 'POST'])
@login_required
def handle_attendance():
    conn = get_db()
    cursor = conn.cursor()
    if request.method == 'GET':
        class_id = request.args.get('class_id', type=int)
        year = request.args.get('year', type=int)
        month = request.args.get('month', type=int)

        if not class_id or not year or not month:
            conn.close()
            return jsonify({'error': '缺少必要參數 class_id, year, month'}), 400

        start_date = f"{year}-{month:02d}-01"
        last_day = calendar.monthrange(year, month)[1]
        end_date = f"{year}-{month:02d}-{last_day:02d}"

        cursor.execute("""
            SELECT a.student_id, a.date, a.status
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            WHERE s.class_id = ? AND a.date BETWEEN ? AND ?
        """, (class_id, start_date, end_date))

        records = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(records)

    elif request.method == 'POST':
        data = request.json
        records = data.get('records', [])
        if not records:
            conn.close()
            return jsonify({'error': '沒有傳送任何記錄'}), 400

        try:
            for rec in records:
                student_id = rec.get('student_id')
                date_str = rec.get('date')
                status = rec.get('status')

                if status == 'absent':
                    cursor.execute("DELETE FROM attendance WHERE student_id = ? AND date = ?",
                                   (student_id, date_str))
                else:
                    cursor.execute("""
                        INSERT INTO attendance (student_id, date, status)
                        VALUES (?, ?, ?)
                        ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status
                    """, (student_id, date_str, status))
            conn.commit()
            conn.close()
            return jsonify({'message': '點名資料儲存成功'})
        except Exception as e:
            conn.close()
            return jsonify({'error': str(e)}), 500

# ── Statistics API ────────────────────────────────────────
@app.route('/api/stats', methods=['GET'])
@login_required
def handle_stats():
    conn = get_db()
    cursor = conn.cursor()
    class_id = request.args.get('class_id', type=int)
    year = request.args.get('year', type=int)

    if not class_id or not year:
        conn.close()
        return jsonify({'error': '缺少必要參數 class_id, year'}), 400

    cursor.execute("""
        SELECT a.student_id, a.date, a.status
        FROM attendance a
        JOIN students s ON a.student_id = s.id
        WHERE s.class_id = ? AND a.date LIKE ?
    """, (class_id, f"{year}-%"))

    records = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(records)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=port, debug=debug)
