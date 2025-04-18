import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import './Inventory.css';

const Inventory = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getCharacter } = useContext(CharacterContext);
  const [character, setCharacter] = useState(null);
  
  useEffect(() => {
    const characterData = getCharacter(id);
    if (characterData) {
      setCharacter(characterData);
    } else {
      navigate('/');
    }
  }, [id, getCharacter, navigate]);
  
  if (!character) return <div>Loading inventory...</div>;
  
  return (
    <div className="inventory-page">
      <h1>{character.name}'s Inventory</h1>
      
      <div className="inventory-list">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Weight</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {character.inventory && character.inventory.length > 0 ? (
              character.inventory.map(item => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td>{item.weight} lbs</td>
                  <td>{item.description}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="empty-inventory">
                  No items in inventory
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Inventory;