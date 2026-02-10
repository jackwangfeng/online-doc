const API_BASE_URL = 'http://localhost:3000/api'

// 获取存储的 token
const getToken = () => localStorage.getItem('token')

// 通用请求函数
const request = async (url: string, options: RequestInit = {}) => {
  const token = getToken()
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }
  
  return data
}

// 认证相关 API
export const authApi = {
  register: (username: string, email: string, password: string) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),
  
  login: (username: string, password: string) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  
  getMe: () => request('/auth/me'),
}

// 文档相关 API
export const documentApi = {
  getAll: () => request('/documents'),
  
  getById: (id: string) => request(`/documents/${id}`),
  
  create: (title?: string) =>
    request('/documents', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  
  update: (id: string, title: string) =>
    request(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    }),
  
  delete: (id: string) =>
    request(`/documents/${id}`, {
      method: 'DELETE',
    }),
}
