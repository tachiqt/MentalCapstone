import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'api/client.dart';

void main() {
  runApp(const SmartCareApp());
}

class SmartCareApp extends StatelessWidget {
  const SmartCareApp({super.key});

  static const Color primary = Color(0xFF0891B2);
  static const Color accent = Color(0xFF059669);
  static const Color background = Color(0xFFECFEFF);
  static const Color foreground = Color(0xFF164E63);
  static const Color muted = Color(0xFFE8F1F6);
  static const Color border = Color(0xFFA5F3FC);
  static const Color destructive = Color(0xFFDC2626);

  @override
  Widget build(BuildContext context) {
    final textTheme = GoogleFonts.notoSansTextTheme().apply(
      bodyColor: foreground,
      displayColor: foreground,
    );

    return MaterialApp(
      title: 'SmartCare',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.light(
          primary: primary,
          secondary: accent,
          surface: Colors.white,
          error: destructive,
          onPrimary: Colors.white,
          onSecondary: Colors.white,
          onSurface: foreground,
        ),
        scaffoldBackgroundColor: background,
        textTheme: textTheme.copyWith(
          headlineMedium: GoogleFonts.figtree(
            fontWeight: FontWeight.w700,
            color: foreground,
          ),
          titleLarge: GoogleFonts.figtree(
            fontWeight: FontWeight.w600,
            color: foreground,
          ),
          labelLarge: GoogleFonts.figtree(fontWeight: FontWeight.w600),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: primary, width: 2),
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            backgroundColor: primary,
            foregroundColor: Colors.white,
            textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600, fontSize: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
        appBarTheme: AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: foreground,
          elevation: 0,
          scrolledUnderElevation: 0,
          titleTextStyle: GoogleFonts.figtree(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: foreground,
          ),
          surfaceTintColor: Colors.transparent,
        ),
      ),
      home: const LoginScreen(),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _api = ApiClient();

  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result = await _api.login(
        username: _usernameController.text.trim(),
        password: _passwordController.text,
      );
      final user = result['user'] as Map<String, dynamic>? ?? {};

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => HomeScreen(api: _api, user: user),
        ),
      );
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Sign in failed. Check your connection.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'SmartCare',
                    style: GoogleFonts.figtree(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: SmartCareApp.foreground,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Mobile operations for teachers, caretakers, and parents.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: SmartCareApp.foreground.withValues(alpha: 0.7),
                        ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: SmartCareApp.border),
                    ),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_error != null) ...[
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEF2F2),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: const Color(0xFFFECACA)),
                              ),
                              child: Text(
                                _error!,
                                style: const TextStyle(color: SmartCareApp.destructive),
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],
                          TextFormField(
                            controller: _usernameController,
                            decoration: const InputDecoration(labelText: 'Username'),
                            textInputAction: TextInputAction.next,
                            autocorrect: false,
                            validator: (v) =>
                                (v == null || v.trim().isEmpty) ? 'Username required' : null,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _passwordController,
                            decoration: const InputDecoration(labelText: 'Password'),
                            obscureText: true,
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => _submit(),
                            validator: (v) =>
                                (v == null || v.isEmpty) ? 'Password required' : null,
                          ),
                          const SizedBox(height: 24),
                          FilledButton(
                            onPressed: _loading ? null : _submit,
                            child: Text(_loading ? 'Signing in…' : 'Sign in'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Demo: teacher / password',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: SmartCareApp.foreground.withValues(alpha: 0.6),
                        ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api, required this.user});

  final ApiClient api;
  final Map<String, dynamic> user;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? _profile;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    try {
      final me = await widget.api.getMe();
      if (mounted) setState(() => _profile = me);
    } catch (_) {
      if (mounted) setState(() => _profile = widget.user);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _formatRole(dynamic role) {
    final value = role is Map ? role['value'] ?? role.toString() : role?.toString() ?? 'user';
    return value.replaceAll('_', ' ').split(' ').map((w) {
      if (w.isEmpty) return w;
      return '${w[0].toUpperCase()}${w.substring(1)}';
    }).join(' ');
  }

  Future<void> _logout() async {
    await widget.api.logout();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = _profile ?? widget.user;
    final name = user['name'] as String? ?? 'User';
    final role = _formatRole(user['role']);

    return Scaffold(
      appBar: AppBar(
        title: const Text('SmartCare'),
        actions: [
          TextButton(
            onPressed: _logout,
            child: Text(
              'Logout',
              style: GoogleFonts.figtree(
                color: SmartCareApp.destructive,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: SmartCareApp.primary))
          : ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: SmartCareApp.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Welcome, $name',
                        style: GoogleFonts.figtree(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: SmartCareApp.foreground,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        role,
                        style: TextStyle(
                          color: SmartCareApp.foreground.withValues(alpha: 0.7),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Dashboard',
                  style: GoogleFonts.figtree(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: SmartCareApp.foreground,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Role-specific workflows (therapy sessions, medication logs, parent feedback) will appear here.',
                  style: TextStyle(
                    color: SmartCareApp.foreground.withValues(alpha: 0.7),
                  ),
                ),
                const SizedBox(height: 24),
                _PlaceholderTile(
                  title: 'My children',
                  subtitle: 'Assigned children and quick actions',
                ),
                _PlaceholderTile(
                  title: 'Today\'s tasks',
                  subtitle: 'Sessions, medications, and follow-ups',
                ),
                _PlaceholderTile(
                  title: 'Messages',
                  subtitle: 'Updates from the care team',
                ),
              ],
            ),
    );
  }
}

class _PlaceholderTile extends StatelessWidget {
  const _PlaceholderTile({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: SmartCareApp.muted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: SmartCareApp.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.figtree(
              fontWeight: FontWeight.w600,
              fontSize: 16,
              color: SmartCareApp.foreground,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: TextStyle(
              fontSize: 14,
              color: SmartCareApp.foreground.withValues(alpha: 0.65),
            ),
          ),
        ],
      ),
    );
  }
}
