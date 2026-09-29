from flask import Blueprint, request, jsonify
from app.config import Config
from app.extensions import new_session_client, supabase, supabase_auth
from app.services.email_utils import normalize_email
from app.services.pending_enrollments import claim_pending_enrollments
from app.services.rate_limit import check_and_record, format_wait
from app.services.rate_limit import reset as reset_rate_limit
from app.services.student_accounts import (
    find_auth_user_id_by_email,
    provision_student_account,
)

auth_bp = Blueprint('auth', __name__)

# Each student now gets their own randomly generated password (see
# student_accounts.generate_temp_password), so there's no fixed password we
# can tell a confused user to "try" anymore — point them at their teacher or
# the reset-password flow instead.
_ALREADY_HAS_ACCOUNT_MESSAGE = (
    'This email already has a login account. Please log in with the '
    'password your teacher gave you, or use "Forgot password?" to set a '
    'new one.'
)


def _rate_limited_response(bucket, email):
    """Returns a 429 Flask response if this bucket+email is locked out, else None."""
    allowed, retry_after = check_and_record(f'{bucket}:{normalize_email(email)}')
    if allowed:
        return None
    wait = format_wait(retry_after)
    return jsonify({
        'error': (
            f'Too many attempts. Please try again in {wait}.'
        ),
        'retry_after_seconds': retry_after,
    }), 429


def _register_user(role):
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    email = data.get('email')
    password = data.get('password')
    display_name = data.get('display_name')
#这里是后端正在接受前端发来的注册信息，因为后端要先拿到信息才能注册所以要用到.get用法#

    if not email or not password or not display_name:
        return jsonify({'error': 'Please provide all information'}), 400

    # Max 10 register attempts per email per hour, then a 5-hour lockout.
    limited = _rate_limited_response('register', email)
    if limited:
        return limited

    try:
        # Fresh client — sign_up establishes a session, which would
        # otherwise poison the shared supabase_auth client's admin calls
        # for every later request in this worker (see new_session_client).
        auth_response = new_session_client().auth.sign_up({
            'email': email,
            'password': password
        })
        #把邮箱和密码传给supabase的auth工具 让它帮我们注册#

        if not auth_response.user:
            return jsonify({'error': 'Failed to create account, please try again or later'}), 400
        
        if not auth_response.session:
            norm = (email or '').strip().lower()
            existing_profile = supabase.table('users').select(
                'id, role, email'
            ).ilike('email', norm).limit(3).execute()
            for row in existing_profile.data or []:
                if (row.get('email') or '').strip().lower() == norm:
                    return jsonify({'error': _ALREADY_HAS_ACCOUNT_MESSAGE}), 409

            auth_user_id = find_auth_user_id_by_email(norm)
            if auth_user_id:
                try:
                    provision_student_account(
                        norm,
                        display_name,
                        grade=(data.get('grade') or '').strip() or None,
                        reset_password=False,
                    )
                    claim_pending_enrollments(auth_user_id, norm)
                    return jsonify({'error': _ALREADY_HAS_ACCOUNT_MESSAGE}), 409
                except Exception:
                    pass

            return jsonify({
                'error': (
                    'Could not complete registration for this email. '
                    'If your teacher added you to a class, log in with the password '
                    'they gave you, or use "Forgot password?" to set a new one.'
                ),
            }), 409
        
        if role not in ['teacher', 'student']:
            return jsonify({'error': 'Invalid role'}), 400
        
        user_id = auth_response.user.id

        try:
            user_payload = {
                'id': user_id,
                'email': email,
                'display_name': display_name,
                'role': role,
            }
            if role == 'student':
                grade = (data.get('grade') or '').strip()
                if grade:
                    user_payload['grade'] = grade
            supabase.table('users').insert(user_payload).execute()
        except Exception as ab_error:
            supabase_auth.auth.admin.delete_user(user_id)
            return jsonify({'error': 'Failed to save your information, try again'}), 500

        if role == 'student':
            claim_pending_enrollments(user_id, email)

        reset_rate_limit(f'register:{email}')

        return jsonify({
            'message': f'{role.capitalize()} registered successfully'
        }), 201

    except Exception as auth_error:
        err = str(auth_error).lower()
        if 'already' in err or 'registered' in err or 'exists' in err:
            return jsonify({'error': _ALREADY_HAS_ACCOUNT_MESSAGE}), 409
        return jsonify({'error': str(auth_error)}), 400


@auth_bp.route('/api/auth/register/teacher', methods=['POST'])
def register_teacher():
    return _register_user('teacher')

@auth_bp.route('/api/auth/register/student', methods=['POST'])
def register_student():
    return _register_user('student')


@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    email = normalize_email(data.get('email'))
    password = data.get('password')
    #从数据里面取出邮箱和密码#

    if not email or not password:
        return jsonify({'error': 'Please provide both email and password'}), 400

    # Max 10 login attempts per email per hour, then a 5-hour lockout.
    # Keyed by the email being attempted, not the caller's IP, so one bad
    # actor can't lock out everyone on the same network (e.g. venue WiFi).
    limited = _rate_limited_response('login', email)
    if limited:
        return limited

    try:
        # Fresh client — see new_session_client() for why.
        auth_response = new_session_client().auth.sign_in_with_password({
            'email': email,
            'password': password
        })
        #把邮箱和密码传给supabase的auth工具 让它帮我们验证，跟注册不一样，注册时sign_up 登陆时用sign_in_with_password#
        if not auth_response.user:
            return jsonify({'error':'Invalid email or password'}), 401
        user_id = auth_response.user.id
        token = auth_response.session.access_token
        refresh_token = auth_response.session.refresh_token
        #从登陆结果中取出用户的唯一ID 和JWT token 用于验证身份#

        user_data = supabase.table('users').select('*').eq('id', user_id).execute()
        #去user表里面取出所有的字段让id等于user_id的用户数据并且执行查询#
        if not user_data.data:
            return jsonify({'error': 'User data not found'}), 404

        user = user_data.data[0]
        from app.blueprints.users import _resolve_avatar_url

        # Login succeeded — clear this email's attempt count so a normal
        # user who mistyped their password a few times isn't left with a
        # nearly-tripped counter hanging over them.
        reset_rate_limit(f'login:{email}')

        return jsonify({
            'token': token,
            'refresh_token': refresh_token,
            'user': {
                'id': user_id,
                'email':email,
                'display_name': user['display_name'],
                'role':user['role'],
                'avatar_url': _resolve_avatar_url(user.get('avatar_url')),
            }
        }), 200
    except Exception as e:
        err = str(e).lower()
        if 'email not confirmed' in err or 'not confirmed' in err:
            return jsonify({
                'error': (
                    'This email is not verified yet. Ask your teacher to add you '
                    'to the class again, or use "Forgot password?" to set a new '
                    'password and verify your account.'
                ),
            }), 401
        return jsonify({'error': 'Invalid email or password'}), 401
     #登录成功的话返回token和用户信息给前端，登录失败的话统一返回401错误#


@auth_bp.route('/api/auth/refresh', methods=['POST'])
def refresh_token_route():
    """Exchange a refresh_token for a new access token (silent re-login)."""
    data = request.get_json(silent=True) or {}
    incoming_refresh_token = (data.get('refresh_token') or '').strip()
    if not incoming_refresh_token:
        return jsonify({'error': 'No refresh token provided'}), 400

    try:
        # Fresh client — see new_session_client() for why.
        auth_response = new_session_client().auth.refresh_session(incoming_refresh_token)
        if not auth_response or not auth_response.session:
            return jsonify({'error': 'Invalid or expired refresh token'}), 401
        session = auth_response.session
        return jsonify({
            'token': session.access_token,
            'refresh_token': session.refresh_token,
        }), 200
    except Exception:
        return jsonify({'error': 'Invalid or expired refresh token'}), 401


@auth_bp.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    """
    Send a password-reset email via Supabase Auth. Always returns the same
    generic message whether or not the email has an account, so this
    endpoint can't be used to check which emails are registered.
    """
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    if not email:
        return jsonify({'error': 'Please provide your email'}), 400

    # Max 10 reset requests per email per hour, then a 5-hour lockout —
    # stops someone from spamming another person's inbox with reset links.
    limited = _rate_limited_response('forgot-password', email)
    if limited:
        return limited

    generic_message = (
        "If an account exists for that email, we've sent a password reset "
        'link. Check your inbox (and spam folder).'
    )

    redirect_to = f"{(Config.FRONTEND_URL or '').rstrip('/')}/reset-password"
    try:
        supabase_auth.auth.reset_password_for_email(email, {
            'redirect_to': redirect_to,
        })
    except Exception:
        # Never leak whether the email exists via the error path either.
        pass

    return jsonify({'message': generic_message}), 200


def _oauth_display_name(auth_user):
    metadata = auth_user.user_metadata or {}
    email = auth_user.email or ''
    return (
        metadata.get('full_name')
        or metadata.get('name')
        or (email.split('@')[0] if email else None)
        or 'User'
    )


def _user_login_payload(user_id, email, user_row, token, refresh_token=None):
    from app.blueprints.users import _resolve_avatar_url

    payload = {
        'status': 'ok',
        'token': token,
        'user': {
            'id': user_id,
            'email': email,
            'display_name': user_row['display_name'],
            'role': user_row['role'],
            'avatar_url': _resolve_avatar_url(user_row.get('avatar_url')),
        },
    }
    if refresh_token:
        payload['refresh_token'] = refresh_token
    return payload


def _oauth_avatar_url(auth_user):
    metadata = auth_user.user_metadata or {}
    return metadata.get('avatar_url') or metadata.get('picture')


def _maybe_backfill_google_avatar(user_id, user_row, auth_user):
    if user_row.get('avatar_url'):
        return user_row
    google_avatar = _oauth_avatar_url(auth_user)
    if not google_avatar:
        return user_row
    try:
        result = supabase.table('users').update({
            'avatar_url': google_avatar,
        }).eq('id', user_id).execute()
        if result.data:
            return result.data[0]
    except Exception:
        pass
    user_row['avatar_url'] = google_avatar
    return user_row


@auth_bp.route('/api/auth/oauth/complete', methods=['POST'])
def oauth_complete():
    """Validate a Supabase OAuth access token and return app user or needs_profile."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    token = data.get('access_token')
    if not token:
        return jsonify({'error': 'No token provided'}), 400
    incoming_refresh_token = data.get('refresh_token')

    try:
        auth_response = supabase_auth.auth.get_user(token)
        if not auth_response or not auth_response.user:
            return jsonify({'error': 'Invalid token'}), 401

        auth_user = auth_response.user
        user_id = auth_user.id
        email = auth_user.email or ''

        user_data = supabase.table('users').select('*').eq('id', user_id).execute()
        if user_data.data:
            user = _maybe_backfill_google_avatar(
                user_id, user_data.data[0], auth_user
            )
            return jsonify(_user_login_payload(
                user_id, email, user, token, refresh_token=incoming_refresh_token
            )), 200

        metadata = auth_user.user_metadata or {}
        return jsonify({
            'status': 'needs_profile',
            'token': token,
            'email': email,
            'suggested_display_name': _oauth_display_name(auth_user),
            'avatar_url': _oauth_avatar_url(auth_user),
        }), 200
    except Exception:
        return jsonify({'error': 'Authentication failed'}), 401


@auth_bp.route('/api/auth/oauth/register', methods=['POST'])
def oauth_register():
    """Create users row for a first-time Google OAuth sign-in."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    token = data.get('access_token')
    role = data.get('role')
    display_name = (data.get('display_name') or '').strip()
    avatar_url = (data.get('avatar_url') or '').strip() or None
    incoming_refresh_token = data.get('refresh_token')

    if not token or not role or not display_name:
        return jsonify({'error': 'Please provide token, role, and display name'}), 400

    if role not in ['teacher', 'student']:
        return jsonify({'error': 'Invalid role'}), 400

    try:
        auth_response = supabase_auth.auth.get_user(token)
        if not auth_response or not auth_response.user:
            return jsonify({'error': 'Invalid token'}), 401

        auth_user = auth_response.user
        user_id = auth_user.id
        email = auth_user.email

        if not email:
            return jsonify({'error': 'Google account has no email address'}), 400

        existing = supabase.table('users').select('*').eq('id', user_id).execute()
        if existing.data:
            return jsonify(_user_login_payload(
                user_id, email, existing.data[0], token, refresh_token=incoming_refresh_token
            )), 200

        payload = {
            'id': user_id,
            'email': email,
            'display_name': display_name,
            'role': role,
        }
        if avatar_url:
            payload['avatar_url'] = avatar_url

        if role == 'student':
            grade = (data.get('grade') or '').strip()
            if grade:
                payload['grade'] = grade

        try:
            supabase.table('users').insert(payload).execute()
        except Exception as insert_err:
            err_text = str(insert_err).lower()
            if avatar_url and 'avatar_url' in err_text:
                supabase.table('users').insert({
                    'id': user_id,
                    'email': email,
                    'display_name': display_name,
                    'role': role,
                }).execute()
            else:
                raise insert_err

        if role == 'student':
            claim_pending_enrollments(user_id, email)

        from app.blueprints.users import _resolve_avatar_url

        oauth_payload = {
            'status': 'ok',
            'token': token,
            'user': {
                'id': user_id,
                'email': email,
                'display_name': display_name,
                'role': role,
                'avatar_url': _resolve_avatar_url(avatar_url),
            },
        }
        if incoming_refresh_token:
            oauth_payload['refresh_token'] = incoming_refresh_token
        return jsonify(oauth_payload), 201
    except Exception as e:
        message = str(e).strip() or 'Failed to complete Google sign-in'
        return jsonify({'error': message}), 500



