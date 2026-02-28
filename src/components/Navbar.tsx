import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Menu } from "lucide-react";
import type { User } from "@/hooks/useAuth";

type NavbarProps = {
  onRegisterClick: () => void;
  onLoginClick: () => void;
  user: User | null;
};

const Navbar = ({ onRegisterClick, onLoginClick, user }: NavbarProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="w-full flex items-center justify-between py-3 px-4 border-b border-[#202225]">
      {/* ЛЕВАЯ часть (бургер) */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          className="sm:hidden text-[#b9bbbe] hover:text-white hover:bg-[#40444b] p-2"
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* ПРАВАЯ часть (приветствие на десктопе) */}
      {user && (
        <div className="text-[#b9bbbe] text-sm hidden sm:block">
          Привет, <span className="text-white font-medium">{user.username || "Игрок"}</span>! 🎮
        </div>
      )}

      {/* МОБИЛЬНОЕ меню */}
      {mobileMenuOpen && (
        <div className="sm:hidden mt-4 pt-4 border-t border-[#202225] w-full">
          <div className="flex flex-col gap-3">
            {!user ? (
              <>
                <Button
                  variant="ghost"
                  className="text-[#b9bbbe] hover:text-white hover:bg-[#40444b] justify-start"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLoginClick();
                  }}
                >
                  Войти
                </Button>

                <Button
                  className="bg-[#5865f2] hover:bg-[#4752c4] text-white justify-start"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onRegisterClick();
                  }}
                >
                  Регистрация
                </Button>
              </>
            ) : (
              <div className="text-[#b9bbbe]">
                Привет, <span className="text-white font-medium">{user.username || "Игрок"}</span>!
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
