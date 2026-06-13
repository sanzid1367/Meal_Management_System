import re

with open(r"e:\Meal\frontend\src\App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add Auth import
content = content.replace(
    'import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";',
    'import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";\nimport { Auth } from "./Auth";'
)

# 2. Add user state and isAdmin
content = content.replace(
    "export function App() {\n  const [activeTab",
    "export function App() {\n  const [user, setUser] = useState(() => {\n    const saved = localStorage.getItem('user');\n    return saved ? JSON.parse(saved) : null;\n  });\n  const isAdmin = user?.role === 'admin';\n  const [activeTab"
)

# 3. Add early return for !user
content = content.replace(
    "  const MembersView = () => (",
    "  if (!user) {\n    return <Auth onLogin={setUser} />;\n  }\n\n  const MembersView = () => ("
)

# 4. Hide Buttons if not admin
content = content.replace(
    '<Button onClick={() => setMemberModalOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">',
    '{isAdmin && <Button onClick={() => setMemberModalOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">'
)
content = content.replace(
    'Add Member</Button>',
    'Add Member</Button>}'
)

content = content.replace(
    '<Button onClick={() => setExpenseModalOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">',
    '{isAdmin && <Button onClick={() => setExpenseModalOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">'
)
content = content.replace(
    'Add Expense</Button>',
    'Add Expense</Button>}'
)

content = content.replace(
    '<Button onClick={() => setDepositModalOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">',
    '{isAdmin && <Button onClick={() => setDepositModalOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">'
)
content = content.replace(
    'Add Deposit</Button>',
    'Add Deposit</Button>}'
)

content = content.replace(
    '<Button onClick={saveMealGrid} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">Save</Button>',
    '{isAdmin && <Button onClick={saveMealGrid} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">Save</Button>}'
)

# 5. Disable inputs in meals if not admin
content = content.replace(
    'if (!isSelected) {',
    'if (!isSelected || !isAdmin) {'
)

# 6. Change avatar to logout
content = content.replace(
    '<div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden">\n              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Avatar" className="w-full h-full object-cover" />\n            </div>',
    '<div className="flex items-center gap-3">\n              <span className="text-sm font-medium text-slate-600 bg-white/50 px-3 py-1 rounded-full">{user.username} ({user.role})</span>\n              <Button variant="outline" size="sm" onClick={() => { localStorage.removeItem("access_token"); localStorage.removeItem("user"); window.location.reload(); }} className="rounded-xl border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-colors">Logout</Button>\n            </div>'
)

# 7. Hide Close Month
content = content.replace(
    '<div className="mt-8 bg-slate-50 rounded-2xl p-6 border border-slate-200 flex items-center justify-between">',
    '{isAdmin && (\n            <div className="mt-8 bg-slate-50 rounded-2xl p-6 border border-slate-200 flex items-center justify-between">'
)
content = content.replace(
    '                Close Current Month\n              </Button>\n            </div>',
    '                Close Current Month\n              </Button>\n            </div>\n          )}'
)

with open(r"e:\Meal\frontend\src\App.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Patched App.tsx")
