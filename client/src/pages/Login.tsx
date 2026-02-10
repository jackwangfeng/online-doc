import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Auth.css'

const API_URL = 'http://localhost:3000'
const GOOGLE_CLIENT_ID = '420915666656-pqdnftq8dvapd7ih1t661g9kk63ivljv.apps.googleusercontent.com'

declare global {
  interface Window {
    google: any
  }
}

export default function Login() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // 如果已登录，跳转到文档列表
    if (user) {
      navigate('/documents')
    }
  }, [user, navigate])

  useEffect(() => {
    // 加载 Google Sign-In API
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.body.appendChild(script)

    script.onload = () => {
      // 初始化 Google Sign-In
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      })

      // 渲染按钮
      window.google.accounts.id.renderButton(
        document.getElementById('google-signin-button'),
        { 
          theme: 'outline', 
          size: 'large',
          width: '100%',
          text: 'signin_with'
        }
      )
    }

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  const handleGoogleResponse = async (response: any) => {
    setIsLoading(true)
    try {
      // 发送 ID Token 到后端验证
      const res = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ credential: response.credential })
      })

      if (res.ok) {
        const data = await res.json()
        // 保存登录状态
        login(data.token, data.user)
        // 跳转到文档列表
        navigate('/documents')
      } else {
        const error = await res.json()
        alert('登录失败: ' + (error.error || '未知错误'))
      }
    } catch (error) {
      console.error('Login error:', error)
      alert('登录失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>在线文档协作</h1>
        <p className="auth-subtitle">实时协作编辑，版本历史管理</p>
        
        <div className="auth-form">
          <h2>欢迎登录</h2>
          
          {isLoading ? (
            <p>登录中...</p>
          ) : (
            <div id="google-signin-button" className="google-button-wrapper"></div>
          )}

          <div className="auth-divider">
            <span>或</span>
          </div>

          <button 
            className="guest-btn"
            onClick={() => navigate('/documents')}
          >
            游客访问
          </button>
        </div>

        <p className="auth-footer">
          登录即表示您同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  )
}
