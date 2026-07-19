from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import DataRequired, Email, EqualTo, ValidationError, Length
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from pathlib import Path
import json
import os
import random
from sqlalchemy import inspect, text, func

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "workouts.db")
IS_VERCEL = os.environ.get("VERCEL") == "1"


def get_database_uri():
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        if "sslmode" not in database_url:
            separator = "&" if "?" in database_url else "?"
            database_url += separator + "sslmode=require"
        return database_url
    return "sqlite:///" + Path(DB_PATH).as_posix()


app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = get_database_uri()
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-only-change-in-production")
app.config["WTF_CSRF_ENABLED"] = True
app.config["SESSION_COOKIE_SECURE"] = IS_VERCEL
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

if IS_VERCEL:
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"
login_manager.login_message = "Per favore accedi per accedere a questa pagina."
login_manager.login_message_category = "info"


# ============= MODELLI =============

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    profile_image = db.Column(db.Text, nullable=True)
    friend_code = db.Column(db.String(4), unique=True, nullable=True, index=True)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    routines = db.relationship('Routine', backref='user', lazy=True, cascade='all, delete-orphan')
    routine_exercises = db.relationship('RoutineExercise', backref='user', lazy=True, cascade='all, delete-orphan')
    routine_sessions = db.relationship('RoutineSession', backref='user', lazy=True, cascade='all, delete-orphan')
    workouts = db.relationship('Workout', backref='user', lazy=True, cascade='all, delete-orphan')
    weight_history = db.relationship('WeightHistory', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f"<User {self.username}>"


class Routine(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(50), nullable=False)
    position = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    exercises = db.relationship('RoutineExercise', backref='routine', lazy=True, cascade='all, delete-orphan',
                                order_by='RoutineExercise.position.asc()')
    sessions = db.relationship('RoutineSession', backref='routine', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f"<Routine {self.id} user={self.user_id} name={self.name}>"


class RoutineExercise(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    routine_id = db.Column(db.Integer, db.ForeignKey('routine.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    exercise = db.Column(db.String(120), nullable=False)
    exercise_id = db.Column(db.String(10), nullable=True)
    default_sets = db.Column(db.Integer, nullable=True)
    default_reps = db.Column(db.String(50), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    position = db.Column(db.Integer, nullable=True)
    superset_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<RoutineExercise {self.id} {self.exercise} routine={self.routine_id}>"


class RoutineSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    routine_id = db.Column(db.Integer, db.ForeignKey('routine.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    workouts = db.relationship('Workout', backref='session', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f"<RoutineSession {self.id} routine={self.routine_id} date={self.date}>"


class Workout(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    session_id = db.Column(db.Integer, db.ForeignKey('routine_session.id'), nullable=True)
    exercise = db.Column(db.String(120), nullable=False)
    exercise_id = db.Column(db.String(10), nullable=True)
    sets = db.Column(db.Integer, nullable=True)
    reps = db.Column(db.String(50), nullable=True)
    weight = db.Column(db.String(50), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    position = db.Column(db.Integer, nullable=True)
    superset_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Workout {self.id} {self.exercise} session={self.session_id}>"


class WeightHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    workout_id = db.Column(db.Integer, db.ForeignKey('workout.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    weight = db.Column(db.Float, nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<WeightHistory {self.id} workout={self.workout_id} {self.weight}kg>"


class Friendship(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    requester_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('requester_id', 'receiver_id'),)

    def __repr__(self):
        return f"<Friendship {self.requester_id}->{self.receiver_id} {self.status}>"


def _generate_friend_code():
    while True:
        code = f"{random.randint(1000, 9999)}"
        if not User.query.filter_by(friend_code=code).first():
            return code


def log_weight(workout, weight_str):
    if not weight_str:
        return
    try:
        w_val = float(weight_str.replace(",", "."))
    except (ValueError, AttributeError):
        return
    entry = WeightHistory(
        workout_id=workout.id,
        user_id=workout.user_id,
        weight=w_val,
        date=workout.created_at.date() if workout.created_at else datetime.utcnow().date(),
    )
    db.session.add(entry)


# ============= FORM =============

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Ricordami')
    submit = SubmitField('Accedi')


class RegisterForm(FlaskForm):
    username = StringField('Username',
                          validators=[DataRequired(), Length(min=3, max=80)])
    email = StringField('Email',
                       validators=[DataRequired(), Email()])
    password = PasswordField('Password',
                            validators=[DataRequired(), Length(min=6)])
    password_confirm = PasswordField('Conferma Password',
                                    validators=[DataRequired(), EqualTo('password', message='Le password non coincidono')])
    submit = SubmitField('Registrati')

    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user:
            raise ValidationError('Questo username è già in uso.')

    def validate_email(self, email):
        user = User.query.filter_by(email=email.data).first()
        if user:
            raise ValidationError('Questo email è già registrato.')


# ============= USER LOADER =============

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


@app.context_processor
def inject_pending_requests():
    if current_user.is_authenticated:
        count = Friendship.query.filter_by(receiver_id=current_user.id, status="pending").count()
        return dict(pending_requests_count=count)
    return dict(pending_requests_count=0)


# ============= DATABASE MIGRATION =============

def ensure_database():
    with app.app_context():
        try:
            db.create_all()
            print("✓ Database tables created/verified")

            inspector = inspect(db.engine)
            existing_tables = inspector.get_table_names()

            if 'workout' in existing_tables:
                cols_info = inspector.get_columns('workout')
                cols = [c["name"] for c in cols_info]

                if "session_id" not in cols:
                    print("→ Aggiungendo colonna session_id a workout...")
                    db.session.execute(text("ALTER TABLE workout ADD COLUMN session_id INTEGER"))
                    db.session.commit()
                    print("✓ Colonna session_id aggiunta")

                if "superset_id" not in cols:
                    db.session.execute(text("ALTER TABLE workout ADD COLUMN superset_id INTEGER"))
                    db.session.commit()
                    print("✓ Colonna superset_id aggiunta a workout")

                if "day" in cols:
                    print("→ Migrazione dati workout -> RoutineExercise/RoutineSession...")
                    _migrate_old_workouts(cols)

            if 'routine_exercise' in existing_tables:
                re_cols = [c["name"] for c in inspector.get_columns('routine_exercise')]
                if "superset_id" not in re_cols:
                    db.session.execute(text("ALTER TABLE routine_exercise ADD COLUMN superset_id INTEGER"))
                    db.session.commit()
                    print("✓ Colonna superset_id aggiunta a routine_exercise")
            else:
                print("✓ Nuovo database, nessuna migrazione necessaria")

            if 'user' in existing_tables:
                user_cols = [c["name"] for c in inspector.get_columns('user')]
                if "profile_image" not in user_cols:
                    db.session.execute(text("ALTER TABLE \"user\" ADD COLUMN profile_image TEXT"))
                    db.session.commit()
                    print("✓ Colonna profile_image aggiunta a user")
                if "friend_code" not in user_cols:
                    db.session.execute(text("ALTER TABLE \"user\" ADD COLUMN friend_code VARCHAR(4)"))
                    db.session.commit()
                    print("✓ Colonna friend_code aggiunta a user")
                    for u in User.query.filter_by(friend_code=None).all():
                        u.friend_code = _generate_friend_code()
                    db.session.commit()
                    print("✓ friend_code assegnati a utenti esistenti")
                if "is_admin" not in user_cols:
                    db.session.execute(text("ALTER TABLE \"user\" ADD COLUMN is_admin BOOLEAN DEFAULT FALSE"))
                    db.session.commit()
                    print("✓ Colonna is_admin aggiunta a user")

            all_users = User.query.all()
            for user in all_users:
                if Routine.query.filter_by(user_id=user.id).count() == 0:
                    _create_default_routines(user)

            db.session.commit()

            admin_username = os.environ.get("ADMIN_USERNAME", "admin")
            default_user = User.query.filter_by(username=admin_username).first()
            admin_password = os.environ.get("ADMIN_PASSWORD")
            if not admin_password and not IS_VERCEL and not os.environ.get("DATABASE_URL"):
                admin_password = "admin123"
            if not default_user and admin_password:
                print("→ Creando utente admin di default...")
                admin = User(
                    username=admin_username,
                    email=os.environ.get("ADMIN_EMAIL", "admin@example.com"),
                    is_admin=True
                )
                admin.set_password(admin_password)
                db.session.add(admin)
                db.session.commit()
                print("✓ Utente admin creato")
            elif default_user and not default_user.is_admin:
                default_user.is_admin = True
                db.session.commit()
                print(f"✓ Utente {admin_username} impostato come admin")

        except Exception as e:
            print(f"⚠ Warning in database migration: {e}")
            db.session.rollback()


def _migrate_old_workouts(cols):
    rows = db.session.execute(text(
        "SELECT id, user_id, exercise, exercise_id, sets, reps, weight, notes, day, date "
        "FROM workout WHERE day IS NOT NULL ORDER BY user_id, day, date"
    )).fetchall()

    if not rows:
        print("  ✓ Nessun vecchio workout da migrare")
        return

    from collections import defaultdict
    user_day_map = defaultdict(lambda: defaultdict(list))
    for r in rows:
        user_day_map[r.user_id][r.day].append(r)

    for user_id, day_map in user_day_map.items():
        has_sessions = RoutineSession.query.filter_by(user_id=user_id).first()
        if has_sessions:
            continue

        routine_pos = Routine.query.filter_by(user_id=user_id).count() + 1

        for day_name, day_rows in sorted(day_map.items()):
            routine = Routine(user_id=user_id, name=day_name, position=routine_pos)
            db.session.add(routine)
            db.session.flush()
            routine_pos += 1

            seen_exercises = {}
            for r in day_rows:
                if r.exercise not in seen_exercises:
                    seen_exercises[r.exercise] = r

            for pos, (ex_name, r) in enumerate(seen_exercises.items(), 1):
                re = RoutineExercise(
                    routine_id=routine.id,
                    user_id=user_id,
                    exercise=r.exercise,
                    exercise_id=r.exercise_id,
                    default_sets=r.sets,
                    default_reps=r.reps,
                    notes=r.notes,
                    position=pos,
                )
                db.session.add(re)

            date_groups = defaultdict(list)
            for r in day_rows:
                date_groups[r.date].append(r)

            for session_date, session_rows in sorted(date_groups.items()):
                session = RoutineSession(
                    routine_id=routine.id,
                    user_id=user_id,
                    date=session_date,
                )
                db.session.add(session)
                db.session.flush()

                seen = {}
                for r in session_rows:
                    if r.exercise not in seen:
                        seen[r.exercise] = r

                for s_pos, (ex_name, r) in enumerate(seen.items(), 1):
                    db.session.execute(text(
                        "UPDATE workout SET session_id = :sid, position = :pos WHERE id = :wid"
                    ), {"sid": session.id, "pos": s_pos, "wid": r.id})

        db.session.commit()
        print(f"  ✓ Migrazione completata per user {user_id}")

    try:
        if db.engine.dialect.name == "postgresql":
            db.session.execute(text("ALTER TABLE workout DROP COLUMN day"))
            db.session.commit()
            print("  ✓ Colonna day rimossa")
        elif db.engine.dialect.name == "sqlite":
            db.session.execute(text(
                "CREATE TABLE workout_new AS "
                "SELECT id, user_id, session_id, exercise, exercise_id, sets, reps, weight, notes, position, created_at "
                "FROM workout"
            ))
            db.session.execute(text("DROP TABLE workout"))
            db.session.execute(text("ALTER TABLE workout_new RENAME TO workout"))
            db.session.commit()
            print("  ✓ Colonna day rimossa (SQLite rebuild)")
    except Exception:
        db.session.rollback()
        print("  ⚠ Impossibile rimuovere colonna day (non critico)")


def _create_default_routines(user):
    print(f"  → Creando routine vuote per {user.username}...")


# ============= EXERCISES DATASET =============

EXERCISES_DATA = []
EXERCISES_BY_ID = {}
EXERCISES_TRANSLATIONS = {}


def load_exercises():
    global EXERCISES_DATA, EXERCISES_BY_ID, EXERCISES_TRANSLATIONS
    base = os.path.join(BASE_DIR, "static", "exercises")
    try:
        with open(os.path.join(base, "exercises.json"), "r", encoding="utf-8") as f:
            EXERCISES_DATA = json.load(f)
        EXERCISES_BY_ID = {ex["id"]: ex for ex in EXERCISES_DATA}
        print(f"Loaded {len(EXERCISES_DATA)} exercises from dataset")
    except Exception as e:
        print(f"Warning: could not load exercises dataset: {e}")
    try:
        with open(os.path.join(base, "translations_it.json"), "r", encoding="utf-8") as f:
            EXERCISES_TRANSLATIONS = json.load(f)
        print(f"Loaded Italian translations")
    except Exception as e:
        print(f"Warning: could not load Italian translations: {e}")


def get_exercise_name_it(ex):
    names_it = EXERCISES_TRANSLATIONS.get("names_it", {})
    return names_it.get(ex["name"].lower(), ex["name"])


def get_body_part_it(bp):
    return EXERCISES_TRANSLATIONS.get("body_part", {}).get(bp.lower(), bp)


def get_target_it(tgt):
    return EXERCISES_TRANSLATIONS.get("target", {}).get(tgt.lower(), tgt)


def get_equipment_it(eq):
    return EXERCISES_TRANSLATIONS.get("equipment", {}).get(eq.lower(), eq)


def _resolve_exercise_name(exercise, exercise_id):
    if exercise_id:
        ex_data = EXERCISES_BY_ID.get(exercise_id)
        if ex_data:
            return get_exercise_name_it(ex_data)
    return exercise


# ============= ROUTES EXERCISES API =============

@app.route("/api/exercises")
@login_required
def search_exercises():
    q = request.args.get("q", "").strip().lower()
    body_part = request.args.get("body_part", "").strip().lower()
    equipment = request.args.get("equipment", "").strip().lower()

    results = EXERCISES_DATA

    if q:
        if q.startswith("*"):
            bp_query = q[1:].strip()
            if bp_query:
                results = [e for e in results if bp_query in e.get("body_part", "").lower() or bp_query in get_body_part_it(e.get("body_part", "")).lower()]
        else:
            results = [e for e in results if q in e["name"].lower() or q in get_exercise_name_it(e).lower()]
    if body_part:
        results = [e for e in results if e.get("body_part", "").lower() == body_part]
    if equipment:
        results = [e for e in results if e.get("equipment", "").lower() == equipment]

    return jsonify([{
        "id": e["id"],
        "name": e["name"],
        "name_it": get_exercise_name_it(e),
        "body_part": e.get("body_part", ""),
        "body_part_it": get_body_part_it(e.get("body_part", "")),
        "target": e.get("target", ""),
        "target_it": get_target_it(e.get("target", "")),
        "equipment": e.get("equipment", ""),
        "equipment_it": get_equipment_it(e.get("equipment", "")),
        "image": url_for("static", filename="exercises/" + e.get("image", ""))
    } for e in results[:50]])


@app.route("/api/exercises/<exercise_id>")
@login_required
def get_exercise_detail(exercise_id):
    ex = EXERCISES_BY_ID.get(exercise_id)
    if not ex:
        return jsonify({"error": "Esercizio non trovato"}), 404
    result = dict(ex)
    result["name_it"] = get_exercise_name_it(ex)
    result["body_part_it"] = get_body_part_it(ex.get("body_part", ""))
    result["target_it"] = get_target_it(ex.get("target", ""))
    result["equipment_it"] = get_equipment_it(ex.get("equipment", ""))
    if result.get("image"):
        result["image"] = url_for("static", filename="exercises/" + result["image"])
    if result.get("gif_url"):
        result["gif_url"] = url_for("static", filename="exercises/" + result["gif_url"])
    return jsonify(result)


@app.route("/exercise/<exercise_id>")
@login_required
def exercise_dataset_detail(exercise_id):
    ex = EXERCISES_BY_ID.get(exercise_id)
    if not ex:
        flash("Esercizio non trovato.", "danger")
        return redirect(url_for("dashboard"))
    detail = dict(ex)
    detail["name_it"] = get_exercise_name_it(ex)
    detail["body_part_it"] = get_body_part_it(ex.get("body_part", ""))
    detail["target_it"] = get_target_it(ex.get("target", ""))
    detail["equipment_it"] = get_equipment_it(ex.get("equipment", ""))
    if detail.get("image"):
        detail["image"] = url_for("static", filename="exercises/" + detail["image"])
    if detail.get("gif_url"):
        detail["gif_url"] = url_for("static", filename="exercises/" + detail["gif_url"])
    return render_template("exercise_detail.html", exercise=detail)


# ============= ERROR HANDLERS =============

@app.errorhandler(404)
def not_found_error(error):
    return render_template('404.html'), 404


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('500.html'), 500


# ============= ROUTES AUTH =============

@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))

    form = RegisterForm()
    if form.validate_on_submit():
        try:
            user = User(
                username=form.username.data.strip(),
                email=form.email.data.strip().lower(),
                friend_code=_generate_friend_code()
            )
            user.set_password(form.password.data)

            db.session.add(user)
            db.session.commit()

            flash("✓ Registrazione completata! Accedi ora.", "success")
            return redirect(url_for("login"))

        except Exception as e:
            db.session.rollback()
            print(f"Registration error: {e}")
            flash(f"✗ Errore durante la registrazione: {str(e)}", "danger")
            return render_template("landing.html", form=form)

    return render_template("landing.html", form=form)


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))

    form = LoginForm()
    if form.validate_on_submit():
        try:
            user = User.query.filter_by(username=form.username.data.strip()).first()
            if user is None or not user.check_password(form.password.data):
                flash("✗ Username o password non validi.", "danger")
                return redirect(url_for("login"))

            if not user.friend_code:
                user.friend_code = _generate_friend_code()
                db.session.commit()

            login_user(user, remember=form.remember_me.data)
            next_page = request.args.get('next')
            if not next_page or not url_has_allowed_host_and_scheme(next_page):
                next_page = url_for('dashboard')
            return redirect(next_page)

        except Exception as e:
            print(f"Login error: {e}")
            flash("✗ Errore durante il login.", "danger")

    return render_template("login.html", form=form)


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("✓ Logout completato.", "info")
    return redirect(url_for("landing"))


# ============= ROUTES ADMIN =============

@app.route("/admin")
@login_required
def admin_panel():
    if not current_user.is_admin:
        flash("✗ Accesso negato.", "danger")
        return redirect(url_for("dashboard"))

    users = User.query.order_by(User.created_at.desc()).all()
    user_data = []
    for u in users:
        routines_count = Routine.query.filter_by(user_id=u.id).count()
        sessions_count = RoutineSession.query.filter_by(user_id=u.id).count()
        workouts_count = Workout.query.filter_by(user_id=u.id).count()
        friendships_count = Friendship.query.filter(
            ((Friendship.requester_id == u.id) | (Friendship.receiver_id == u.id)),
            Friendship.status == "accepted"
        ).count()
        user_data.append({
            "user": u,
            "routines": routines_count,
            "sessions": sessions_count,
            "workouts": workouts_count,
            "friends": friendships_count,
        })

    total_users = len(users)
    total_sessions = RoutineSession.query.count()
    total_workouts = Workout.query.count()
    total_friendships = Friendship.query.filter_by(status="accepted").count()

    return render_template("admin.html",
                           user_data=user_data,
                           total_users=total_users,
                           total_sessions=total_sessions,
                           total_workouts=total_workouts,
                           total_friendships=total_friendships)


@app.route("/admin/toggle-admin/<int:user_id>", methods=["POST"])
@login_required
def toggle_admin(user_id):
    if not current_user.is_admin:
        flash("✗ Accesso negato.", "danger")
        return redirect(url_for("dashboard"))

    user = db.session.get(User, user_id)
    if not user:
        flash("✗ Utente non trovato.", "danger")
        return redirect(url_for("admin_panel"))

    if user.id == current_user.id:
        flash("✗ Non puoi rimuovere il tuo stesso admin.", "danger")
        return redirect(url_for("admin_panel"))

    user.is_admin = not user.is_admin
    db.session.commit()
    status = "promosso ad admin" if user.is_admin else "retrocesso da admin"
    flash(f"✓ {user.username} {status}.", "success")
    return redirect(url_for("admin_panel"))


@app.route("/admin/delete-user/<int:user_id>", methods=["POST"])
@login_required
def admin_delete_user(user_id):
    if not current_user.is_admin:
        flash("✗ Accesso negato.", "danger")
        return redirect(url_for("dashboard"))

    user = db.session.get(User, user_id)
    if not user:
        flash("✗ Utente non trovato.", "danger")
        return redirect(url_for("admin_panel"))

    if user.id == current_user.id:
        flash("✗ Non puoi eliminare te stesso.", "danger")
        return redirect(url_for("admin_panel"))

    uid = user.id
    username = user.username
    WeightHistory.query.filter_by(user_id=uid).delete()
    Workout.query.filter_by(user_id=uid).delete()
    RoutineSession.query.filter_by(user_id=uid).delete()
    RoutineExercise.query.filter_by(user_id=uid).delete()
    Routine.query.filter_by(user_id=uid).delete()
    Friendship.query.filter(
        (Friendship.requester_id == uid) | (Friendship.receiver_id == uid)
    ).delete()
    db.session.delete(user)
    db.session.commit()
    flash(f"✓ Utente {username} eliminato.", "success")
    return redirect(url_for("admin_panel"))


@app.route("/admin/reset-password/<int:user_id>", methods=["POST"])
@login_required
def admin_reset_password(user_id):
    if not current_user.is_admin:
        flash("✗ Accesso negato.", "danger")
        return redirect(url_for("dashboard"))

    user = db.session.get(User, user_id)
    if not user:
        flash("✗ Utente non trovato.", "danger")
        return redirect(url_for("admin_panel"))

    import string
    new_pass = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    user.set_password(new_pass)
    db.session.commit()
    flash(f"✓ Password di {user.username} resettata. Nuova password: <strong>{new_pass}</strong>", "success")
    return redirect(url_for("admin_panel"))


@app.route("/admin/edit-user/<int:user_id>", methods=["POST"])
@login_required
def admin_edit_user(user_id):
    if not current_user.is_admin:
        flash("✗ Accesso negato.", "danger")
        return redirect(url_for("dashboard"))

    user = db.session.get(User, user_id)
    if not user:
        flash("✗ Utente non trovato.", "danger")
        return redirect(url_for("admin_panel"))

    new_username = request.form.get("username", "").strip()
    new_friend_code = request.form.get("friend_code", "").strip()

    if new_username and new_username != user.username:
        existing = User.query.filter(User.username == new_username, User.id != user.id).first()
        if existing:
            flash("✗ Username già in uso.", "danger")
            return redirect(url_for("admin_panel"))
        user.username = new_username

    if new_friend_code and new_friend_code != user.friend_code:
        if not new_friend_code.isdigit() or len(new_friend_code) != 4:
            flash("✗ Il friend code deve essere di 4 cifre.", "danger")
            return redirect(url_for("admin_panel"))
        existing = User.query.filter(User.friend_code == new_friend_code, User.id != user.id).first()
        if existing:
            flash("✗ Friend code già in uso.", "danger")
            return redirect(url_for("admin_panel"))
        user.friend_code = new_friend_code

    db.session.commit()
    flash(f"✓ Utente aggiornato.", "success")
    return redirect(url_for("admin_panel"))


@app.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    if request.method == "POST":
        new_username = request.form.get("username", "").strip()
        new_email = request.form.get("email", "").strip()
        current_password = request.form.get("current_password", "").strip()
        new_password = request.form.get("new_password", "").strip()

        if not current_password:
            flash("✗ Inserisci la password attuale per confermare.", "danger")
            return redirect(url_for("profile"))

        if not current_user.check_password(current_password):
            flash("✗ Password errata.", "danger")
            return redirect(url_for("profile"))

        if new_username and new_username != current_user.username:
            existing = User.query.filter(User.username == new_username, User.id != current_user.id).first()
            if existing:
                flash("✗ Username già in uso.", "danger")
                return redirect(url_for("profile"))
            current_user.username = new_username

        if new_email and new_email != current_user.email:
            existing = User.query.filter(User.email == new_email, User.id != current_user.id).first()
            if existing:
                flash("✗ Email già in uso.", "danger")
                return redirect(url_for("profile"))
            current_user.email = new_email

        if new_password:
            current_user.set_password(new_password)

        image_file = request.files.get("profile_image")
        if image_file and image_file.filename:
            import base64
            ext = image_file.filename.rsplit(".", 1)[-1].lower()
            if ext in ("png", "jpg", "jpeg", "gif", "webp"):
                data = base64.b64encode(image_file.read()).decode("utf-8")
                current_user.profile_image = f"data:image/{ext};base64,{data}"
            else:
                flash("✗ Formato immagine non supportato.", "danger")
                return redirect(url_for("profile"))

        db.session.commit()
        flash("✓ Profilo aggiornato.", "success")
        return redirect(url_for("profile"))

    return render_template("profile.html")


# ============= ROUTES FRIENDSHIPS =============

@app.route("/search", methods=["GET", "POST"])
@login_required
def search_users():
    results = []
    query = ""
    if request.method == "POST":
        query = request.form.get("query", "").strip()
    elif request.args.get("q"):
        query = request.args.get("q", "").strip()

    if query:
        if "#" in query:
            parts = query.split("#", 1)
            name_part = parts[0].strip()
            code_part = parts[1].strip()
            user = User.query.filter(
                func.lower(User.username) == name_part.lower(),
                User.friend_code == code_part,
                User.id != current_user.id
            ).first()
            if user:
                results = [user]
        else:
            users = User.query.filter(
                func.lower(User.username).contains(query.lower()),
                User.id != current_user.id
            ).limit(20).all()
            results = users

    friendships = {}
    for u in results:
        f = Friendship.query.filter(
            ((Friendship.requester_id == current_user.id) & (Friendship.receiver_id == u.id)) |
            ((Friendship.requester_id == u.id) & (Friendship.receiver_id == current_user.id))
        ).first()
        friendships[u.id] = f

    return render_template("search.html", results=results, query=query, friendships=friendships)


@app.route("/friend-request/<int:user_id>", methods=["POST"])
@login_required
def send_friend_request(user_id):
    if user_id == current_user.id:
        flash("✗ Non puoi aggiungere te stesso.", "danger")
        return redirect(url_for("search_users"))

    target = db.session.get(User, user_id)
    if not target:
        flash("✗ Utente non trovato.", "danger")
        return redirect(url_for("search_users"))

    existing = Friendship.query.filter(
        ((Friendship.requester_id == current_user.id) & (Friendship.receiver_id == user_id)) |
        ((Friendship.requester_id == user_id) & (Friendship.receiver_id == current_user.id))
    ).first()

    if existing:
        if existing.status == "accepted":
            flash("✗ Siete già amici.", "info")
        elif existing.status == "pending":
            if existing.receiver_id == current_user.id:
                existing.status = "accepted"
                db.session.commit()
                flash(f"✓ Richiesta di {target.username} accettata!", "success")
            else:
                flash("✗ Richiesta già inviata.", "info")
        return redirect(url_for("search_users"))

    f = Friendship(requester_id=current_user.id, receiver_id=user_id, status="pending")
    db.session.add(f)
    db.session.commit()
    flash(f"✓ Richiesta di amicizia inviata a {target.username}.", "success")
    return redirect(url_for("search_users"))


@app.route("/friend-accept/<int:friendship_id>", methods=["POST"])
@login_required
def accept_friend_request(friendship_id):
    f = db.session.get(Friendship, friendship_id)
    if not f or f.receiver_id != current_user.id or f.status != "pending":
        flash("✗ Richiesta non valida.", "danger")
        return redirect(url_for("notifications"))

    f.status = "accepted"
    db.session.commit()
    requester = db.session.get(User, f.requester_id)
    flash(f"✓ Amicizia con {requester.username} accettata!", "success")
    return redirect(url_for("notifications"))


@app.route("/friend-reject/<int:friendship_id>", methods=["POST"])
@login_required
def reject_friend_request(friendship_id):
    f = db.session.get(Friendship, friendship_id)
    if not f or f.receiver_id != current_user.id or f.status != "pending":
        flash("✗ Richiesta non valida.", "danger")
        return redirect(url_for("notifications"))

    db.session.delete(f)
    db.session.commit()
    flash("✗ Richiesta rifiutata.", "info")
    return redirect(url_for("notifications"))


@app.route("/friend-remove/<int:friendship_id>", methods=["POST"])
@login_required
def remove_friend(friendship_id):
    f = db.session.get(Friendship, friendship_id)
    if not f or f.status != "accepted":
        flash("✗ Amicizia non valida.", "danger")
        return redirect(url_for("notifications"))

    if f.requester_id != current_user.id and f.receiver_id != current_user.id:
        flash("✗ Non hai accesso.", "danger")
        return redirect(url_for("notifications"))

    other = db.session.get(User, f.receiver_id if f.requester_id == current_user.id else f.requester_id)
    db.session.delete(f)
    db.session.commit()
    flash(f"✗ Amicizia con {other.username} rimossa.", "info")
    return redirect(url_for("notifications"))


@app.route("/notifications")
@login_required
def notifications():
    received = Friendship.query.filter_by(receiver_id=current_user.id, status="pending").all()
    sent = Friendship.query.filter_by(requester_id=current_user.id, status="pending").all()
    friends = Friendship.query.filter(
        ((Friendship.requester_id == current_user.id) | (Friendship.receiver_id == current_user.id)),
        Friendship.status == "accepted"
    ).all()

    received_users = []
    for f in received:
        u = db.session.get(User, f.requester_id)
        if u:
            received_users.append({"friendship": f, "user": u})

    sent_users = []
    for f in sent:
        u = db.session.get(User, f.receiver_id)
        if u:
            sent_users.append({"friendship": f, "user": u})

    friend_users = []
    for f in friends:
        uid = f.receiver_id if f.requester_id == current_user.id else f.requester_id
        u = db.session.get(User, uid)
        if u:
            friend_users.append({"friendship": f, "user": u})

    return render_template("notifications.html",
                           received=received_users, sent=sent_users, friends=friend_users)


@app.route("/friend-stats/<int:user_id>")
@login_required
def friend_stats(user_id):
    target = db.session.get(User, user_id)
    if not target:
        flash("✗ Utente non trovato.", "danger")
        return redirect(url_for("notifications"))

    f = Friendship.query.filter(
        ((Friendship.requester_id == current_user.id) & (Friendship.receiver_id == user_id)) |
        ((Friendship.requester_id == user_id) & (Friendship.receiver_id == current_user.id)),
        Friendship.status == "accepted"
    ).first()

    if not f:
        flash("✗ Puoi vedere le stats solo degli amici accettati.", "danger")
        return redirect(url_for("notifications"))

    routines = Routine.query.filter_by(user_id=target.id).order_by(Routine.position.asc()).all()
    routine_stats = {}

    for r in routines:
        template_exercises = RoutineExercise.query.filter_by(routine_id=r.id).order_by(RoutineExercise.position.asc()).all()
        sessions = RoutineSession.query.filter_by(routine_id=r.id, user_id=target.id).order_by(RoutineSession.date.desc()).all()
        exercise_stats = []

        for re in template_exercises:
            session_workouts = []
            for s in sessions:
                wo = Workout.query.filter_by(session_id=s.id, exercise=re.exercise, user_id=target.id).first()
                if wo:
                    session_workouts.append((s, wo))

            latest_sw = session_workouts[0] if session_workouts else None
            pr_sw = max(session_workouts, key=lambda x: float(x[1].weight) if x[1].weight else 0) if session_workouts else None

            latest_weight = None
            latest_date = None
            if latest_sw:
                try:
                    latest_weight = float(latest_sw[1].weight.replace(",", ".")) if latest_sw[1].weight else None
                except (ValueError, AttributeError):
                    latest_weight = None
                latest_date = latest_sw[0].date

            pr_weight = None
            pr_date = None
            if pr_sw and pr_sw[1].weight:
                try:
                    pr_weight = float(pr_sw[1].weight.replace(",", "."))
                    pr_date = pr_sw[0].date
                except (ValueError, AttributeError):
                    pass

            exercise_stats.append({
                "routine_exercise": re,
                "name_it": _resolve_exercise_name(re.exercise, re.exercise_id),
                "latest_weight": latest_weight,
                "latest_date": latest_date,
                "pr_weight": pr_weight,
                "pr_date": pr_date,
                "total_sessions": len(session_workouts),
            })

        if exercise_stats:
            routine_stats[r.name] = exercise_stats

    return render_template("friend_stats.html", target=target, routine_stats=routine_stats, routines=routines)


# ============= ROUTES DASHBOARD =============

@app.route("/")
def landing():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))
    form = RegisterForm()
    return render_template("landing.html", form=form)


@app.route("/dashboard")
@login_required
def dashboard():
    routines = Routine.query.filter_by(user_id=current_user.id).order_by(Routine.position.asc()).all()
    routine_data = []
    for r in routines:
        exercises = RoutineExercise.query.filter_by(routine_id=r.id).order_by(RoutineExercise.position.asc()).all()
        last_session = RoutineSession.query.filter_by(routine_id=r.id, user_id=current_user.id).order_by(RoutineSession.date.desc()).first()
        session_count = RoutineSession.query.filter_by(routine_id=r.id, user_id=current_user.id).count()
        routine_data.append({
            "routine": r,
            "exercises": exercises,
            "last_session": last_session,
            "session_count": session_count,
        })
    return render_template("index.html", routine_data=routine_data)


# ============= ROUTES ROUTINE CRUD =============

@app.route("/routines/add", methods=["POST"])
@login_required
def add_routine():
    try:
        data = request.get_json() if request.is_json else None
        if data:
            name = data.get("name", "").strip()
        else:
            name = request.form.get("name", "").strip()

        if not name:
            return jsonify({"error": "Nome mancante"}), 400

        max_pos = db.session.query(func.max(Routine.position)).filter(
            Routine.user_id == current_user.id
        ).scalar()
        routine = Routine(user_id=current_user.id, name=name, position=(max_pos or 0) + 1)
        db.session.add(routine)
        db.session.commit()
        return jsonify({"id": routine.id, "name": routine.name, "position": routine.position}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400


@app.route("/routines/rename/<int:routine_id>", methods=["POST"])
@login_required
def rename_routine(routine_id):
    try:
        routine = Routine.query.get_or_404(routine_id)
        if routine.user_id != current_user.id:
            return jsonify({"error": "Non hai accesso"}), 403

        data = request.get_json() if request.is_json else None
        if data:
            new_name = data.get("name", "").strip()
        else:
            new_name = request.form.get("name", "").strip()

        if not new_name:
            return jsonify({"error": "Nome mancante"}), 400

        routine.name = new_name
        db.session.commit()
        return jsonify({"id": routine.id, "name": routine.name})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400


@app.route("/routines/delete/<int:routine_id>", methods=["POST"])
@login_required
def delete_routine(routine_id):
    try:
        routine = Routine.query.get_or_404(routine_id)
        if routine.user_id != current_user.id:
            return jsonify({"error": "Non hai accesso"}), 403

        sessions = RoutineSession.query.filter_by(routine_id=routine.id).all()
        for session in sessions:
            workouts = Workout.query.filter_by(session_id=session.id).all()
            for w in workouts:
                WeightHistory.query.filter_by(workout_id=w.id).delete()
            Workout.query.filter_by(session_id=session.id).delete()

        RoutineExercise.query.filter_by(routine_id=routine.id).delete()
        RoutineSession.query.filter_by(routine_id=routine.id).delete()
        db.session.delete(routine)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400


# ============= ROUTES MANAGE ROUTINE TEMPLATE =============

@app.route("/routines/<int:routine_id>/manage")
@login_required
def manage_routine(routine_id):
    routine = Routine.query.get_or_404(routine_id)
    if routine.user_id != current_user.id:
        flash("✗ Non hai accesso a questa routine.", "danger")
        return redirect(url_for("dashboard"))

    exercises = RoutineExercise.query.filter_by(routine_id=routine.id).order_by(
        func.coalesce(RoutineExercise.position, 9999).asc(), RoutineExercise.position.asc()
    ).all()
    return render_template("manage_routine.html", routine=routine, exercises=exercises)


@app.route("/routines/<int:routine_id>/exercises/add", methods=["POST"])
@login_required
def add_routine_exercise(routine_id):
    routine = Routine.query.get_or_404(routine_id)
    if routine.user_id != current_user.id:
        flash("✗ Non hai accesso.", "danger")
        return redirect(url_for("dashboard"))

    exercise = request.form.get("exercise", "").strip()
    exercise_id = request.form.get("exercise_id", "").strip() or None
    sets = request.form.get("sets", "").strip()
    reps = request.form.get("reps", "").strip()
    notes = request.form.get("notes", "").strip()

    if not exercise:
        flash("✗ Inserisci il nome dell'esercizio.", "danger")
        return redirect(url_for("manage_routine", routine_id=routine_id))

    if exercise_id and exercise_id not in EXERCISES_BY_ID:
        exercise_id = None

    max_pos = db.session.query(func.max(RoutineExercise.position)).filter(
        RoutineExercise.routine_id == routine_id
    ).scalar()

    re = RoutineExercise(
        routine_id=routine_id,
        user_id=current_user.id,
        exercise=exercise,
        exercise_id=exercise_id,
        default_sets=int(sets) if sets and sets.isdigit() else None,
        default_reps=reps if reps else None,
        notes=notes if notes else None,
        position=(max_pos or 0) + 1,
    )
    db.session.add(re)
    db.session.commit()
    flash(f"✓ Esercizio '{exercise}' aggiunto alla routine.", "success")
    return redirect(url_for("manage_routine", routine_id=routine_id))


@app.route("/routines/exercises/<int:exercise_id>/edit", methods=["POST"])
@login_required
def edit_routine_exercise(exercise_id):
    re = RoutineExercise.query.get_or_404(exercise_id)
    if re.user_id != current_user.id:
        flash("✗ Non hai accesso.", "danger")
        return redirect(url_for("dashboard"))

    exercise = request.form.get("exercise", "").strip()
    exercise_id_val = request.form.get("exercise_id", "").strip() or None
    sets = request.form.get("sets", "").strip()
    reps = request.form.get("reps", "").strip()
    notes = request.form.get("notes", "").strip()

    if not exercise:
        flash("✗ Inserisci il nome dell'esercizio.", "danger")
    else:
        re.exercise = exercise
        if exercise_id_val and exercise_id_val in EXERCISES_BY_ID:
            re.exercise_id = exercise_id_val
        else:
            re.exercise_id = None
        re.default_sets = int(sets) if sets and sets.isdigit() else None
        re.default_reps = reps if reps else None
        re.notes = notes if notes else None
        db.session.commit()
        flash("✓ Esercizio aggiornato.", "success")

    return redirect(url_for("manage_routine", routine_id=re.routine_id))


@app.route("/routines/exercises/<int:exercise_id>/delete", methods=["POST"])
@login_required
def delete_routine_exercise(exercise_id):
    re = RoutineExercise.query.get_or_404(exercise_id)
    if re.user_id != current_user.id:
        flash("✗ Non hai accesso.", "danger")
        return redirect(url_for("dashboard"))

    routine_id = re.routine_id
    db.session.delete(re)
    db.session.commit()
    flash("✓ Esercizio rimosso dalla routine.", "info")
    return redirect(url_for("manage_routine", routine_id=routine_id))


@app.route("/routines/<int:routine_id>/superset", methods=["POST"])
@login_required
def toggle_superset(routine_id):
    data = request.get_json()
    id1 = data.get("id1")
    id2 = data.get("id2")
    if not id1 or not id2:
        return jsonify({"error": "Mancano gli ID"}), 400

    re1 = RoutineExercise.query.get(id1)
    re2 = RoutineExercise.query.get(id2)
    if not re1 or not re2 or re1.routine_id != routine_id or re2.routine_id != routine_id:
        return jsonify({"error": "Esercizi non validi"}), 400
    if re1.user_id != current_user.id or re2.user_id != current_user.id:
        return jsonify({"error": "Non hai accesso"}), 403

    if re1.superset_id and re1.superset_id == re2.superset_id:
        return jsonify({"error": "Gia in superset"}), 400

    existing_re1 = RoutineExercise.query.filter(
        RoutineExercise.routine_id == routine_id,
        RoutineExercise.superset_id == re1.superset_id,
        RoutineExercise.superset_id.isnot(None),
        RoutineExercise.id != re1.id,
    ).first()
    existing_re2 = RoutineExercise.query.filter(
        RoutineExercise.routine_id == routine_id,
        RoutineExercise.superset_id == re2.superset_id,
        RoutineExercise.superset_id.isnot(None),
        RoutineExercise.id != re2.id,
    ).first()

    if existing_re1 or existing_re2:
        return jsonify({"error": "Uno degli esercizi e gia in un superset"}), 400

    superset_id = min(re1.id, re2.id)
    re1.superset_id = superset_id
    re2.superset_id = superset_id
    db.session.commit()
    return jsonify({"success": True, "superset_id": superset_id})


@app.route("/routines/exercises/<int:exercise_id>/unsuperset", methods=["POST"])
@login_required
def unsuperset(exercise_id):
    re = RoutineExercise.query.get_or_404(exercise_id)
    if re.user_id != current_user.id:
        return jsonify({"error": "Non hai accesso"}), 403

    if not re.superset_id:
        return jsonify({"error": "Non e in un superset"}), 400

    sid = re.superset_id
    partner = RoutineExercise.query.filter(
        RoutineExercise.routine_id == re.routine_id,
        RoutineExercise.superset_id == sid,
        RoutineExercise.id != re.id,
    ).first()
    re.superset_id = None
    if partner:
        partner.superset_id = None
    db.session.commit()
    return jsonify({"success": True})


@app.route("/routines/<int:routine_id>/exercises/reorder", methods=["POST"])
@login_required
def reorder_routine_exercises(routine_id):
    try:
        data = request.get_json()
        order = data.get("order", [])
        for item in order:
            re = RoutineExercise.query.filter_by(id=item["id"], routine_id=routine_id, user_id=current_user.id).first()
            if re:
                re.position = item["position"]
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400


# ============= ROUTES START ROUTINE / SESSION =============

@app.route("/routines/<int:routine_id>/start", methods=["POST"])
@login_required
def start_routine(routine_id):
    routine = Routine.query.get_or_404(routine_id)
    if routine.user_id != current_user.id:
        flash("✗ Non hai accesso.", "danger")
        return redirect(url_for("dashboard"))

    exercises = RoutineExercise.query.filter_by(routine_id=routine.id).order_by(RoutineExercise.position.asc()).all()

    if not exercises:
        flash("✗ Nessun esercizio nella routine. Aggiungine prima nella gestione.", "danger")
        return redirect(url_for("manage_routine", routine_id=routine_id))

    session = RoutineSession(
        routine_id=routine.id,
        user_id=current_user.id,
        date=datetime.utcnow().date(),
    )
    db.session.add(session)
    db.session.flush()

    for re in exercises:
        workout = Workout(
            user_id=current_user.id,
            session_id=session.id,
            exercise=re.exercise,
            exercise_id=re.exercise_id,
            sets=re.default_sets,
            reps=re.default_reps,
            weight=None,
            notes=re.notes,
            position=re.position,
            superset_id=re.superset_id,
        )
        db.session.add(workout)

    db.session.commit()
    flash(f"✓ Sessione '{routine.name}' avviata per oggi!", "success")
    return redirect(url_for("session_view", session_id=session.id))


@app.route("/session/<int:session_id>")
@login_required
def session_view(session_id):
    session = RoutineSession.query.get_or_404(session_id)
    if session.user_id != current_user.id:
        flash("✗ Non hai accesso a questa sessione.", "danger")
        return redirect(url_for("dashboard"))

    workouts = Workout.query.filter_by(session_id=session.id).order_by(
        func.coalesce(Workout.position, 9999).asc(), Workout.position.asc()
    ).all()

    workout_data = []
    for w in workouts:
        name_it = _resolve_exercise_name(w.exercise, w.exercise_id)
        workout_data.append({"workout": w, "name_it": name_it})

    superset_groups = {}
    for wd in workout_data:
        sid = wd["workout"].superset_id
        if sid:
            if sid not in superset_groups:
                superset_groups[sid] = []
            superset_groups[sid].append(wd)

    return render_template("session_view.html", session=session, workout_data=workout_data, superset_groups=superset_groups)


@app.route("/session/<int:session_id>/workout/<int:workout_id>/update", methods=["POST"])
@login_required
def update_session_workout(session_id, workout_id):
    session = RoutineSession.query.get_or_404(session_id)
    if session.user_id != current_user.id:
        flash("✗ Non hai accesso.", "danger")
        return redirect(url_for("dashboard"))

    w = Workout.query.get_or_404(workout_id)
    if w.session_id != session.id or w.user_id != current_user.id:
        flash("✗ Workout non valido.", "danger")
        return redirect(url_for("dashboard"))

    weight = request.form.get("weight", "").strip()
    sets = request.form.get("sets", "").strip()
    reps = request.form.get("reps", "").strip()

    old_weight = w.weight
    w.weight = weight if weight else None
    if sets and sets.isdigit():
        w.sets = int(sets)
    if reps:
        w.reps = reps

    if weight and weight != old_weight:
        log_weight(w, weight)

    db.session.commit()
    return redirect(url_for("session_view", session_id=session_id))


@app.route("/session/<int:session_id>/superset/<int:superset_id>/update", methods=["POST"])
@login_required
def update_superset_group(session_id, superset_id):
    session = RoutineSession.query.get_or_404(session_id)
    if session.user_id != current_user.id:
        flash("✗ Non hai accesso.", "danger")
        return redirect(url_for("dashboard"))

    workouts = Workout.query.filter_by(session_id=session.id, superset_id=superset_id, user_id=current_user.id).all()
    if not workouts:
        flash("✗ Superset non valido.", "danger")
        return redirect(url_for("session_view", session_id=session_id))

    sets = request.form.get("sets", "").strip()
    reps = request.form.get("reps", "").strip()

    for w in workouts:
        if sets and sets.isdigit():
            w.sets = int(sets)
        if reps:
            w.reps = reps

    db.session.commit()
    return redirect(url_for("session_view", session_id=session_id))


@app.route("/session/<int:session_id>/workout/<int:workout_id>/delete", methods=["POST"])
@login_required
def delete_session_workout(session_id, workout_id):
    try:
        session = RoutineSession.query.get_or_404(session_id)
        if session.user_id != current_user.id:
            flash("✗ Non hai accesso.", "danger")
            return redirect(url_for("dashboard"))

        w = Workout.query.get_or_404(workout_id)
        if w.session_id != session.id or w.user_id != current_user.id:
            flash("✗ Workout non valido.", "danger")
            return redirect(url_for("dashboard"))

        WeightHistory.query.filter_by(workout_id=w.id).delete()
        db.session.delete(w)
        db.session.commit()
        flash("✓ Esercizio rimosso dalla sessione.", "info")
    except Exception as e:
        db.session.rollback()
        flash(f"✗ Errore: {str(e)}", "danger")

    return redirect(url_for("session_view", session_id=session_id))


@app.route("/session/<int:session_id>/delete", methods=["POST"])
@login_required
def delete_session(session_id):
    try:
        session = RoutineSession.query.get_or_404(session_id)
        if session.user_id != current_user.id:
            flash("✗ Non hai accesso.", "danger")
            return redirect(url_for("dashboard"))

        workouts = Workout.query.filter_by(session_id=session.id).all()
        for w in workouts:
            WeightHistory.query.filter_by(workout_id=w.id).delete()
        Workout.query.filter_by(session_id=session.id).delete()
        db.session.delete(session)
        db.session.commit()
        flash("✓ Sessione eliminata.", "info")
    except Exception as e:
        db.session.rollback()
        flash(f"✗ Errore: {str(e)}", "danger")

    return redirect(url_for("dashboard"))


# ============= ROUTES WORKOUT DETAIL =============

@app.route("/workout/<int:workout_id>")
@login_required
def view_workout(workout_id):
    w = Workout.query.get_or_404(workout_id)
    if w.user_id != current_user.id:
        flash("Non hai accesso a questo workout.", "danger")
        return redirect(url_for("dashboard"))

    exercise_detail = None
    if w.exercise_id:
        ex = EXERCISES_BY_ID.get(w.exercise_id)
        if ex:
            exercise_detail = dict(ex)
            exercise_detail["name_it"] = get_exercise_name_it(ex)
            exercise_detail["body_part_it"] = get_body_part_it(ex.get("body_part", ""))
            exercise_detail["target_it"] = get_target_it(ex.get("target", ""))
            exercise_detail["equipment_it"] = get_equipment_it(ex.get("equipment", ""))
            if exercise_detail.get("image"):
                exercise_detail["image"] = url_for("static", filename="exercises/" + exercise_detail["image"])
            if exercise_detail.get("gif_url"):
                exercise_detail["gif_url"] = url_for("static", filename="exercises/" + exercise_detail["gif_url"])

    session = RoutineSession.query.get(w.session_id) if w.session_id else None
    return render_template("view_workout.html", w=w, exercise_detail=exercise_detail, session=session)


# ============= ROUTES STATS =============

@app.route("/stats")
@login_required
def stats():
    routines = Routine.query.filter_by(user_id=current_user.id).order_by(Routine.position.asc()).all()
    routine_stats = {}

    for r in routines:
        template_exercises = RoutineExercise.query.filter_by(routine_id=r.id).order_by(RoutineExercise.position.asc()).all()
        sessions = RoutineSession.query.filter_by(routine_id=r.id, user_id=current_user.id).order_by(RoutineSession.date.desc()).all()
        exercise_stats = []

        for re in template_exercises:
            session_workouts = []
            for s in sessions:
                wo = Workout.query.filter_by(session_id=s.id, exercise=re.exercise, user_id=current_user.id).first()
                if wo:
                    session_workouts.append((s, wo))

            latest_sw = session_workouts[0] if session_workouts else None
            pr_sw = max(session_workouts, key=lambda x: float(x[1].weight) if x[1].weight else 0) if session_workouts else None

            latest_weight = None
            latest_date = None
            if latest_sw:
                try:
                    latest_weight = float(latest_sw[1].weight.replace(",", ".")) if latest_sw[1].weight else None
                except (ValueError, AttributeError):
                    latest_weight = None
                latest_date = latest_sw[0].date

            pr_weight = None
            pr_date = None
            if pr_sw and pr_sw[1].weight:
                try:
                    pr_weight = float(pr_sw[1].weight.replace(",", "."))
                    pr_date = pr_sw[0].date
                except (ValueError, AttributeError):
                    pass

            exercise_stats.append({
                "routine_exercise": re,
                "name_it": _resolve_exercise_name(re.exercise, re.exercise_id),
                "latest_weight": latest_weight,
                "latest_date": latest_date,
                "pr_weight": pr_weight,
                "pr_date": pr_date,
                "total_sessions": len(session_workouts),
            })

        routine_stats[r.name] = exercise_stats

    return render_template("stats.html", routine_stats=routine_stats, routines=routines)


@app.route("/stats/clear", methods=["POST"])
@login_required
def clear_stats():
    uid = current_user.id
    db.session.execute(text("DELETE FROM weight_history WHERE user_id = :uid"), {"uid": uid})
    db.session.execute(text("DELETE FROM workout WHERE user_id = :uid"), {"uid": uid})
    db.session.execute(text("DELETE FROM routine_session WHERE user_id = :uid"), {"uid": uid})
    db.session.commit()
    flash("✓ Tutti i dati sono stati cancellati.", "success")
    return redirect(url_for("stats"))


# ============= ROUTE EXERCISE HISTORY FOR CHARTS =============

@app.route("/api/routine-exercise-history/<int:routine_id>")
@login_required
def routine_exercise_history(routine_id):
    routine = Routine.query.get_or_404(routine_id)
    owner_id = routine.user_id

    if owner_id == current_user.id:
        pass
    else:
        f = Friendship.query.filter(
            ((Friendship.requester_id == current_user.id) & (Friendship.receiver_id == owner_id)) |
            ((Friendship.requester_id == owner_id) & (Friendship.receiver_id == current_user.id)),
            Friendship.status == "accepted"
        ).first()
        if not f:
            return jsonify({"error": "Non hai accesso"}), 403

    exercise_name = request.args.get("exercise", "").strip()
    exercise_id = request.args.get("exercise_id", "").strip() or None
    sessions = RoutineSession.query.filter_by(routine_id=routine.id, user_id=owner_id).order_by(RoutineSession.date.asc()).all()

    data = []
    for s in sessions:
        wo = None
        if exercise_id:
            wo = Workout.query.filter_by(session_id=s.id, exercise_id=exercise_id, user_id=owner_id).first()
        if not wo:
            wo = Workout.query.filter_by(session_id=s.id, exercise=exercise_name, user_id=owner_id).first()
        if wo and wo.weight:
            try:
                w_val = float(wo.weight.replace(",", "."))
                data.append({"date": s.date.strftime('%d/%m/%Y'), "weight": w_val})
            except (ValueError, AttributeError):
                pass

    return jsonify(data)


# ============= WEIGHT HISTORY API =============

@app.route("/api/weight-history/<int:workout_id>")
@login_required
def get_weight_history(workout_id):
    w = Workout.query.get_or_404(workout_id)
    if w.user_id != current_user.id:
        return jsonify({"error": "Non hai accesso"}), 403
    entries = WeightHistory.query.filter_by(
        workout_id=workout_id, user_id=current_user.id
    ).order_by(WeightHistory.date.asc(), WeightHistory.id.asc()).all()
    return jsonify([{
        "id": e.id,
        "weight": e.weight,
        "date": e.date.isoformat(),
        "created_at": e.created_at.isoformat() if e.created_at else None,
    } for e in entries])


@app.route("/api/weight-history/<int:workout_id>", methods=["POST"])
@login_required
def add_weight_entry(workout_id):
    w = Workout.query.get_or_404(workout_id)
    if w.user_id != current_user.id:
        return jsonify({"error": "Non hai accesso"}), 403
    data = request.get_json()
    weight = data.get("weight")
    date_str = data.get("date")
    if not weight:
        return jsonify({"error": "Peso mancante"}), 400
    try:
        w_val = float(str(weight).replace(",", "."))
    except ValueError:
        return jsonify({"error": "Peso non valido"}), 400
    try:
        entry_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else datetime.utcnow().date()
    except ValueError:
        entry_date = datetime.utcnow().date()
    entry = WeightHistory(workout_id=workout_id, user_id=current_user.id, weight=w_val, date=entry_date)
    db.session.add(entry)
    w.weight = str(w_val)
    db.session.commit()
    return jsonify({"id": entry.id, "weight": entry.weight, "date": entry.date.isoformat()}), 201


@app.route("/api/weight-history/entry/<int:entry_id>", methods=["PUT"])
@login_required
def update_weight_entry(entry_id):
    entry = WeightHistory.query.get_or_404(entry_id)
    if entry.user_id != current_user.id:
        return jsonify({"error": "Non hai accesso"}), 403
    data = request.get_json()
    if "weight" in data:
        try:
            entry.weight = float(str(data["weight"]).replace(",", "."))
        except ValueError:
            return jsonify({"error": "Peso non valido"}), 400
    if "date" in data:
        try:
            entry.date = datetime.strptime(data["date"], "%Y-%m-%d").date()
        except ValueError:
            pass
    w = Workout.query.get(entry.workout_id)
    if w:
        w.weight = str(entry.weight)
    db.session.commit()
    return jsonify({"id": entry.id, "weight": entry.weight, "date": entry.date.isoformat()})


@app.route("/api/weight-history/entry/<int:entry_id>", methods=["DELETE"])
@login_required
def delete_weight_entry(entry_id):
    entry = WeightHistory.query.get_or_404(entry_id)
    if entry.user_id != current_user.id:
        return jsonify({"error": "Non hai accesso"}), 403
    workout_id = entry.workout_id
    db.session.delete(entry)
    db.session.commit()
    latest = WeightHistory.query.filter_by(workout_id=workout_id, user_id=current_user.id).order_by(WeightHistory.date.desc(), WeightHistory.id.desc()).first()
    w = Workout.query.get(workout_id)
    if w:
        w.weight = str(latest.weight) if latest else None
        db.session.commit()
    return jsonify({"success": True})


# ============= HELPER =============

def url_has_allowed_host_and_scheme(url, allowed_hosts=None):
    from urllib.parse import urlparse, urljoin
    if allowed_hosts is None:
        allowed_hosts = [request.host]
    ref_url = urlparse(request.host_url)
    test_url = urlparse(urljoin(request.host_url, url))
    return test_url.scheme in ('http', 'https') and test_url.netloc in allowed_hosts


_db_initialized = False


@app.before_request
def init_db_once():
    global _db_initialized
    if not _db_initialized:
        ensure_database()
        load_exercises()
        _db_initialized = True


if __name__ == "__main__":
    with app.app_context():
        ensure_database()
        load_exercises()
    app.run(debug=True)
