/**
 * Application entry / 应用入口
 *
 * AuthProvider wraps the whole tree so any component can call useAuth() /
 * 用 AuthProvider 包裹整棵 React 树，这样子组件里都能使用 useAuth()
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "@/context/AuthContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);

//这里就像是React context的provider，把App包裹起来，这样子App里的组件都能使用useAuth() //
//就像是全剧共享的储物柜->这样放进任何的用户信息，应用里的任何组件都可以访问就比较简单简洁//
//之所以要疯转到这里因为这里是最外层，可以被所有组件访问//
//用户信息是登录完之后，AuthContext 的 login function 把token和用户信息放进去，调用 useContext(AuthContext) 去取。//