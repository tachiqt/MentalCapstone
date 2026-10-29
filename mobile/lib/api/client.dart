import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';

class ApiClient {
  ApiClient({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = (baseUrl ?? apiBaseUrl).replaceAll(RegExp(r'/+$'), '');

  final http.Client _client;
  final String _baseUrl;
  String? _token;

  String get baseUrl => _baseUrl;
  String? get token => _token;

  void setToken(String? token) {
    _token = token;
  }

  Map<String, String> _headers({bool json = true}) {
    final headers = <String, String>{
      'Accept': 'application/json',
      if (json) 'Content-Type': 'application/json',
    };
    if (_token != null && _token!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_token';
    }
    return headers;
  }

  Future<Map<String, dynamic>> _decodeResponse(http.Response response) async {
    Map<String, dynamic>? body;
    if (response.body.isNotEmpty) {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        body = decoded;
      }
    }

    if (response.statusCode >= 400) {
      final message = body?['message'] as String? ?? 'Request failed (${response.statusCode})';
      throw ApiException(message, statusCode: response.statusCode);
    }

    return body ?? <String, dynamic>{};
  }

  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/login'),
      headers: _headers(),
      body: jsonEncode({'username': username, 'password': password}),
    );

    final data = await _decodeResponse(response);
    final token = data['token'] as String?;
    if (token != null) {
      _token = token;
    }
    return data;
  }

  Future<Map<String, dynamic>> getMe() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/me'),
      headers: _headers(json: false),
    );
    return _decodeResponse(response);
  }

  Future<void> logout() async {
    try {
      await _client.post(
        Uri.parse('$_baseUrl/logout'),
        headers: _headers(json: false),
      );
    } finally {
      _token = null;
    }
  }
}

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}
