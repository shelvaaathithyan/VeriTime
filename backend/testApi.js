fetch('http://localhost:5001/api/explanations/6bef99f0-890f-41bf-8aa0-daa42930ab1f')
  .then(res => res.json())
  .then(console.log)
  .catch(console.error);
