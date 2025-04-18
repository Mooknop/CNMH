import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { CharacterContext } from '../../contexts/CharacterContext';
import './Navbar.css';

const Navbar = () => {
  const { activeCharacter } = useContext(CharacterContext);
  
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">PF2E Character Viewer</Link>
      </div>
      <ul className="navbar-nav">
        <li className="nav-item">
          <Link to="/" className="nav-link">Characters</Link>
        </li>
        {activeCharacter && (
          <>
            <li className="nav-item">
              <Link to={`/character/${activeCharacter.id}`} className="nav-link">
                {activeCharacter.name}
              </Link>
            </li>
            <li className="nav-item">
              <Link to={`/character/${activeCharacter.id}/notes`} className="nav-link">
                Session Notes
              </Link>
            </li>
          </>
        )}
        <li className="nav-item">
          <Link to="/lore" className="nav-link">Lore</Link>
        </li>
      </ul>
    </nav>
  );
};

export default Navbar;